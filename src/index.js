export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. 서버 상태 확인 테스트용 엔드포인트
    if (url.pathname === "/") {
      return new Response("ai-change API Server is running!", {
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }

    // 2. 전체 유저 목록 조회 API (/api/users)
    if (url.pathname === "/api/users" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare("SELECT * FROM users").all();
        return Response.json(results);
      } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
      }
    }

    // 3. 존재하지 않는 경로 처리 (404)
    return new Response("Not Found", { status: 404 });
  }
};