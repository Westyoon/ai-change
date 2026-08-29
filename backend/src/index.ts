export interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  BETTER_AUTH_URL: string; // 예: http://localhost:8787
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

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
      // 1. 구글 로그인 페이지로 리다이렉트 (/api/auth/google)
      if (url.pathname === "/api/auth/google") {
        console.log("CLIENT_ID 확인:", env.GOOGLE_CLIENT_ID);
        console.log("BETTER_AUTH_URL 확인:", env.BETTER_AUTH_URL);

        const redirectUri = `${env.BETTER_AUTH_URL}/api/auth/callback`;
        const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${env.GOOGLE_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=email%20profile`;
        
        console.log("생성된 구글 로그인 URL:", googleAuthUrl);

        return new Response("구글 로그인 성공! 인증 코드를 정상적으로 받아왔습니다.", {
            headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      // 2. 구글 로그인 완료 후 돌아오는 콜백 처리 (/api/auth/callback)
      if (url.pathname === "/api/auth/callback") {
        const code = url.searchParams.get("code");
        if (!code) return new Response("인증 코드가 없습니다.", { status: 400 });

        const redirectUri = `${env.BETTER_AUTH_URL}/api/auth/callback`;

        // 2-1. 구글에 code를 주고 토큰(Access Token) 교환
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        });
        const tokenData: any = await tokenRes.json();
        if (!tokenData.access_token) return new Response("구글 토큰 발급 실패", { status: 400 });

        // 2-2. 토큰으로 구글 유저 정보(이메일, 이름) 가져오기
        const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const googleUser: any = await userRes.json();
        
        const userId = googleUser.sub; // 구글 고유 ID를 유저 ID로 사용
        const email = googleUser.email;
        const name = googleUser.name;

        // 2-3. DB에 유저가 없으면 자동으로 회원가입 처리 (users & stats 생성)
        const existingUser = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(userId).first();

        if (!existingUser) {
          await env.DB.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, ?)")
            .bind(userId, email, name)
            .run();

          await env.DB.prepare("INSERT INTO stats (user_id, attack, hp, defense, clears, score) VALUES (?, 0, 100, 0, 0, 0)")
            .bind(userId)
            .run();
        }

        // 2-4. 로그인이 끝났으면 프론트엔드 메인 페이지로 이동시키면서 쿠키에 userId 저장
        return new Response(null, {
          status: 302,
          headers: {
            Location: `http://localhost:5173?userId=${userId}`, // 프론트엔드 주소로 변경 가능
            "Set-Cookie": `userId=${userId}; Path=/; HttpOnly; SameSite=Lax`,
          },
        });
      }

      // 3. 서버 상태 확인
      if (url.pathname === "/api/health" && request.method === "GET") {
        return Response.json({ status: "ok" }, { headers: corsHeaders });
      }

      // 4. 기존 유저 목록 조회
      if (url.pathname === "/api/users" && request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM users").all();
        return Response.json(results, { headers: corsHeaders });
      }

      // 5. 특정 유저 스탯 조회
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

      // 6. 미니게임 클리어 및 스탯 증가
      if (url.pathname === "/api/stats" && request.method === "PUT") {
        const { userId, selectedStat, newScore } = (await request.json()) as any;
        if (!userId) return Response.json({ error: "userId는 필수입니다." }, { status: 400, headers: corsHeaders });

        const currentStat: any = await env.DB.prepare(
          "SELECT attack, hp, defense, score, clears FROM stats WHERE user_id = ?"
        ).bind(userId).first();

        if (!currentStat) return Response.json({ error: "스탯 정보가 없습니다." }, { status: 404, headers: corsHeaders });

        const updatedAttack = selectedStat === "attack" ? Number(currentStat.attack) + 1 : Number(currentStat.attack);
        const updatedHp = selectedStat === "hp" ? Number(currentStat.hp) + 1 : Number(currentStat.hp);
        const updatedDefense = selectedStat === "defense" ? Number(currentStat.defense) + 1 : Number(currentStat.defense);
        const updatedClears = Number(currentStat.clears) + 1;
        const updatedScore = newScore !== undefined ? Math.max(Number(currentStat.score), Number(newScore)) : Number(currentStat.score);

        await env.DB.prepare(
          `UPDATE stats SET attack = ?, hp = ?, defense = ?, clears = ?, score = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`
        ).bind(updatedAttack, updatedHp, updatedDefense, updatedClears, updatedScore, userId).run();

        return Response.json({ message: "갱신 완료", attack: updatedAttack, hp: updatedHp, defense: updatedDefense, clears: updatedClears, score: updatedScore }, { headers: corsHeaders });
      }

      return Response.json({ error: "Not Found" }, { status: 404, headers: corsHeaders });

    } catch (error: any) {
      return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }
  },
};