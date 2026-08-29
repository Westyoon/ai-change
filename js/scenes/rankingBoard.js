export default class RankingScene {
    constructor(containerElement) {
        this.container = containerElement;
        this.rankings = [];
    }

    // 씬 초기화 및 데이터 로드
    async init() {
        this.renderLayout();
        await this.loadRankingData();
    }

    // 데이터 로드 (현재는 로컬 더미 데이터, 추후 fetch로 교체)
    async loadRankingData() {
        try {
            // TODO: 나중에 실제 백엔드 연동 시 아래 주석 해제
            // const response = await fetch('http://localhost:8787/api/ranking');
            // this.rankings = await response.json();

            // 임시 더미 데이터 (화면 테스트용)
            this.rankings = [
                { rank: 1, name: "AI공학도", score: 1250, attack: 45 },
                { rank: 2, name: "이화인", score: 1100, attack: 40 },
                { rank: 3, name: "개발자", score: 950, attack: 35 },
                { rank: 4, name: "새싹이", score: 800, attack: 30 },
                { rank: 5, name: "코딩왕", score: 720, attack: 25 }
            ];

            this.updateRankingUI();
        } catch (error) {
            console.error("랭킹 데이터를 불러오는 데 실패했습니다:", error);
        }
    }

    // 기본 레이아웃 뼈대 생성
    renderLayout() {
        this.container.innerHTML = `
            <div class="ranking-modal">
                <h2>🏆 전광판 랭킹</h2>
                <ul class="ranking-list">
                    <!-- 데이터가 동적으로 들어갈 자리 -->
                </ul>
                <button class="close-ranking-btn">닫기</button>
            </div>
        `;
    }

    // 랭킹 리스트 UI 업데이트
    updateRankingUI() {
        const listContainer = this.container.querySelector('.ranking-list');
        
        if (!this.rankings.length) {
            listContainer.innerHTML = `<li class="no-data">등록된 랭킹 데이터가 없습니다.</li>`;
            return;
        }

        listContainer.innerHTML = this.rankings.map(user => `
            <li class="ranking-item rank-${user.rank}">
                <span class="rank-number">${user.rank}위</span>
                <span class="rank-name">${user.name}</span>
                <span class="rank-score">${user.score}점</span>
                <span class="rank-stat">공격력: ${user.attack}</span>
            </li>
        `).join('');
    }
}