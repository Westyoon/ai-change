export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS 헤더 설정 (프론트엔드 연동용)
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8",
    };

    // Preflight (CORS) 요청 예외 처리
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 1. 서버 상태 확인 (/api/health - GET)
      if (url.pathname === "/api/health" && request.method === "GET") {
        return Response.json({ status: "ok" }, { headers: corsHeaders });
      }

      // 2. 신규 유저 생성 (/api/users - POST)
      if (url.pathname === "/api/users" && request.method === "POST") {
        const { id, email, name } = await request.json();
        
        if (!id || !email) {
          return Response.json({ error: "id와 email은 필수입니다." }, { status: 400, headers: corsHeaders });
        }

        // 유저 추가 및 기본 스탯 레코드 생성 (hp: 100, attack: 0, defense: 0, clears: 0, score: 0)
        await env.DB.prepare(
          "INSERT INTO users (id, email, name) VALUES (?, ?, ?)"
        ).bind(id, email, name || null).run();

        await env.DB.prepare(
          "INSERT INTO stats (user_id) VALUES (?)"
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

      // 5. 미니게임 결과 및 스탯 업데이트 (/api/stats - PUT)
      if (url.pathname === "/api/stats" && request.method === "PUT") {
        const { userId, attack, hp, defense, newScore, isClear } = await request.json();

        if (!userId) {
          return Response.json({ error: "userId는 필수입니다." }, { status: 400, headers: corsHeaders });
        }

        const currentStat = await env.DB.prepare(
          "SELECT attack, hp, defense, score, clears FROM stats WHERE user_id = ?"
        ).bind(userId).first();

        if (!currentStat) {
          return Response.json({ error: "해당 유저의 스탯 정보가 없습니다." }, { status: 404, headers: corsHeaders });
        }

        // 새 수치가 전달되었으면 업데이트, 없으면 기존 수치 유지
        const updatedAttack = attack !== undefined ? attack : currentStat.attack;
        const updatedHp = hp !== undefined ? hp : currentStat.hp;
        const updatedDefense = defense !== undefined ? defense : currentStat.defense;
        
        // 클리어 여부에 따른 clears 횟수 누적 (+1)
        const updatedClears = isClear ? currentStat.clears + 1 : currentStat.clears;
        
        // 신규 점수가 들어오면 기존 최고 점수와 비교하여 더 높은 점수로 최고 기록 갱신
        const updatedScore = newScore !== undefined ? Math.max(currentStat.score, newScore) : currentStat.score;

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
          message: "스탯 및 게임 결과 업데이트 성공", 
          attack: updatedAttack,
          hp: updatedHp,
          defense: updatedDefense,
          clears: updatedClears, 
          score: updatedScore 
        }, { headers: corsHeaders });
      }

      // 6. 랭킹 보드 조회 (/api/rankings - GET)
      // ?type=score (점수 랭킹) 또는 ?type=clears (클리어 횟수 랭킹)
      if (url.pathname === "/api/rankings" && request.method === "GET") {
        const type = url.searchParams.get("type") || "score";
        const limit = url.searchParams.get("limit") || 10;

        let query = "";

        if (type === "clears") {
          // 클리어 횟수(clears) 전용 랭킹
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
          // 최고 점수(score) 전용 랭킹
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