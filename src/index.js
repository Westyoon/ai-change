export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS 및 UTF-8 응답 헤더 설정
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 1. 서버 상태 확인
      if (url.pathname === "/api/health" && request.method === "GET") {
        return Response.json({ status: "ok" }, { headers: corsHeaders });
      }

      // 2. 신규 유저 생성 (/api/users - POST)
      if (url.pathname === "/api/users" && request.method === "POST") {
        const { id, email, name } = await request.json();
        
        if (!id || !email) {
          return Response.json({ error: "id와 email은 필수입니다." }, { status: 400, headers: corsHeaders });
        }

        const existingUser = await env.DB.prepare(
          "SELECT id FROM users WHERE id = ? OR email = ?"
        ).bind(id, email).first();

        if (existingUser) {
          return Response.json({ error: "이미 존재하는 ID 또는 이메일입니다." }, { status: 400, headers: corsHeaders });
        }

        // 유저 추가 및 초기 스탯 생성 (clears: 0, score: 0 명시)
        await env.DB.prepare(
          "INSERT INTO users (id, email, name) VALUES (?, ?, ?)"
        ).bind(id, email, name || null).run();

        await env.DB.prepare(
          "INSERT INTO stats (user_id, attack, hp, defense, clears, score) VALUES (?, 0, 100, 0, 0, 0)"
        ).bind(id).run();

        return Response.json({ message: "유저 및 초기 스탯 생성 완료", userId: id }, { status: 201, headers: corsHeaders });
      }

      // 3. 전체 유저 목록 조회 (/api/users - GET)
      if (url.pathname === "/api/users" && request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM users").all();
        return Response.json(results, { headers: corsHeaders });
      }

      // 4. 특정 유저 스탯/기록 조회 (/api/stats/:userId - GET)
      if (url.pathname.startsWith("/api/stats/") && request.method === "GET") {
        const userId = url.pathname.split("/")[3];
        const stat = await env.DB.prepare(
          "SELECT s.*, u.name, u.email FROM stats s JOIN users u ON s.user_id = u.id WHERE s.user_id = ?"
        ).bind(userId).first();

        if (!stat) {
          return Response.json({ error: "유저 정보를 찾을 수 없습니다." }, { status: 404, headers: corsHeaders });
        }

        return Response.json(stat, { headers: corsHeaders });
      }

      // 5. 미니게임 클리어 및 스탯 선택 증가 (/api/stats - PUT)
      if (url.pathname === "/api/stats" && request.method === "PUT") {
        const { userId, selectedStat, newScore } = await request.json();

        if (!userId) {
          return Response.json({ error: "userId는 필수입니다." }, { status: 400, headers: corsHeaders });
        }

        const validStats = ["attack", "defense", "hp"];
        if (selectedStat && !validStats.includes(selectedStat)) {
          return Response.json({ error: "selectedStat은 'attack', 'defense', 'hp' 중 하나여야 합니다." }, { status: 400, headers: corsHeaders });
        }

        const currentStat = await env.DB.prepare(
          "SELECT attack, hp, defense, score, clears FROM stats WHERE user_id = ?"
        ).bind(userId).first();

        if (!currentStat) {
          return Response.json({ error: "해당 유저의 스탯 정보가 없습니다." }, { status: 404, headers: corsHeaders });
        }

        // NULL 방지 처리 및 스탯 +1 증가
        const currentAttack = Number(currentStat.attack || 0);
        const currentHp = Number(currentStat.hp || 100);
        const currentDefense = Number(currentStat.defense || 0);
        const currentClears = Number(currentStat.clears || 0);
        const currentScore = Number(currentStat.score || 0);

        const updatedAttack = selectedStat === "attack" ? currentAttack + 1 : currentAttack;
        const updatedHp = selectedStat === "hp" ? currentHp + 1 : currentHp;
        const updatedDefense = selectedStat === "defense" ? currentDefense + 1 : currentDefense;

        // clears 수치 무조건 +1 증가
        const updatedClears = currentClears + 1;

        // 최고 점수 비교 갱신
        const updatedScore = newScore !== undefined ? Math.max(currentScore, Number(newScore)) : currentScore;

        await env.DB.prepare(
          `UPDATE stats 
           SET attack = ?, 
               hp = ?, 
               defense = ?, 
               clears = ?, 
               score = ?, 
               updated_at = CURRENT_TIMESTAMP 
           WHERE user_id = ?`
        ).bind(updatedAttack, updatedHp, updatedDefense, updatedClears, updatedScore, userId).run();

        return Response.json({ 
          message: "클리어 완료! 선택한 스탯 및 클리어 수가 증가했습니다.", 
          selectedStat,
          attack: updatedAttack,
          hp: updatedHp,
          defense: updatedDefense,
          clears: updatedClears, 
          score: updatedScore 
        }, { headers: corsHeaders });
      }

      // 6. 랭킹 보드 조회 (/api/rankings - GET)
      if (url.pathname === "/api/rankings" && request.method === "GET") {
        const type = url.searchParams.get("type") || "score";
        const limit = url.searchParams.get("limit") || 10;

        let query = "";

        if (type === "clears") {
          query = `
            SELECT 
              RANK() OVER (ORDER BY s.clears DESC) AS rank,
              s.user_id, u.name, u.email, s.clears, s.score, s.updated_at
            FROM stats s
            JOIN users u ON s.user_id = u.id
            ORDER BY s.clears DESC
            LIMIT ?
          `;
        } else {
          query = `
            SELECT 
              RANK() OVER (ORDER BY s.score DESC) AS rank,
              s.user_id, u.name, u.email, s.score, s.clears, s.updated_at
            FROM stats s
            JOIN users u ON s.user_id = u.id
            ORDER BY s.score DESC
            LIMIT ?
          `;
        }

        const { results } = await env.DB.prepare(query).bind(Number(limit)).all();
        return Response.json({ type, results }, { headers: corsHeaders });
      }

      return Response.json({ error: "Not Found" }, { status: 404, headers: corsHeaders });

    } catch (error) {
      return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }
  }
};