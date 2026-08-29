const BACKEND_URL = "http://localhost:8787";

window.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlUserId = urlParams.get("userId");

    if (urlUserId) {
        localStorage.setItem("userId", urlUserId);
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    const userId = localStorage.getItem("userId");

    if (userId) {
        document.getElementById("login-section").classList.add("hidden");
        document.getElementById("dashboard-section").classList.remove("hidden");
        
        await fetchUserStats(userId);
    }
});

async function fetchUserStats(userId) {
    try {
        const res = await fetch(`${BACKEND_URL}/api/stats/${userId}`);
        if (!res.ok) throw new Error("스탯을 불러오지 못했습니다.");
        
        const data = await res.json();
        document.getElementById("user-welcome").innerText = `${data.name} 님 환영합니다!`;
        document.getElementById("stat-attack").innerText = data.attack;
        document.getElementById("stat-hp").innerText = data.hp;
        document.getElementById("stat-defense").innerText = data.defense;
        document.getElementById("stat-clears").innerText = data.clears;
        document.getElementById("stat-score").innerText = data.score;
    } catch (error) {
        console.error(error);
        logout();
    }
}

async function clearStage() {
    const userId = localStorage.getItem("userId");
    if (!userId) return;

    try {
        const res = await fetch(`${BACKEND_URL}/api/stats`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId: userId,
                selectedStat: "attack",
                newScore: 100
            })
        });

        if (!res.ok) throw new Error("스탯 업데이트 실패");

        const updated = await res.json();
        document.getElementById("stat-attack").innerText = updated.attack;
        document.getElementById("stat-hp").innerText = updated.hp;
        document.getElementById("stat-defense").innerText = updated.defense;
        document.getElementById("stat-clears").innerText = updated.clears;
        document.getElementById("stat-score").innerText = updated.score;
        
        alert("스테이지 클리어! 공격력이 1 증가했습니다.");
    } catch (error) {
        alert("오류가 발생했습니다: " + error.message);
    }
}

function logout() {
    localStorage.removeItem("userId");
    window.location.href = window.location.pathname;
}