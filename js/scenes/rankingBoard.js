export default class RankingScene {
    constructor(containerElement) {
        this.container = containerElement;
        this.rankings = [];
        this.currentCriteria = 'score'; // 기본 정렬 기준 ('score' 또는 'clears')
    }

    // 씬 초기화 및 데이터 로드
    async init() {
        this.renderLayout();
        this.bindEvents();
        await this.loadRankingData();
    }

    // 데이터 로드 (현재는 로컬 더미 데이터, 추후 fetch로 교체)
    async loadRankingData() {
        try {
            // TODO: 나중에 실제 백엔드 연동 시 아래 주석 해제
            // const response = await fetch(`http://localhost:8787/api/ranking?criteria=${this.currentCriteria}`);
            // this.rankings = await response.json();

            // 임시 더미 데이터 (클리어 횟수 'clears' 필드 추가)
            this.rankings = [
                { name: "AI공학도", score: 1250, clears: 8, attack: 45 },
                { name: "이화인", score: 1100, clears: 12, attack: 40 },
                { name: "개발자", score: 950, clears: 5, attack: 35 },
                { name: "새싹이", score: 800, clears: 10, attack: 30 },
                { name: "코딩왕", score: 720, clears: 3, attack: 25 }
            ];

            this.sortAndRender();
        } catch (error) {
            console.error("랭킹 데이터를 불러오는 데 실패했습니다:", error);
        }
    }

    // 기본 레이아웃 뼈대 생성 (탭 버튼 ID 추가)
    renderLayout() {
        this.container.innerHTML = `
            <div class="ranking-modal">
                <h2>🏆 전광판 랭킹</h2>
                <div class="ranking-tabs">
                    <button id="score-tab" class="tab-btn ${this.currentCriteria === 'score' ? 'active' : ''}">점수 기준</button>
                    <button id="clears-tab" class="tab-btn ${this.currentCriteria === 'clears' ? 'active' : ''}">클리어 기준</button>
                </div>
                <ul class="ranking-list">
                    <!-- 데이터가 동적으로 들어갈 자리 -->
                </ul>
                <button class="close-ranking-btn">닫기</button>
            </div>
        `;
    }

    // 탭 버튼 클릭 이벤트 바인딩
    bindEvents() {
        const scoreTab = this.container.querySelector('#score-tab');
        const clearsTab = this.container.querySelector('#clears-tab');

        scoreTab.addEventListener('click', () => {
            this.switchCriteria('score');
        });

        clearsTab.addEventListener('click', () => {
            this.switchCriteria('clears');
        });
    }

    // 기준 변경 및 UI 갱신
    switchCriteria(criteria) {
        this.currentCriteria = criteria;
        
        // 탭 활성화 스타일 토글
        this.container.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        this.container.querySelector(`#${criteria}-tab`).classList.add('active');

        this.sortAndRender();
    }

    // 데이터 정렬 후 순위(rank)를 다시 매겨서 UI 업데이트
    sortAndRender() {
        // 기준에 따라 정렬
        this.rankings.sort((a, b) => {
            if (this.currentCriteria === 'clears') {
                return b.clears - a.clears; // 클리어 횟수 내림차순
            }
            return b.score - a.score; // 점수 내림차순
        });

        // 정렬된 순서에 맞춰 1위부터 등수 부여
        this.rankings = this.rankings.map((user, index) => ({
            ...user,
            rank: index + 1
        }));

        this.updateRankingUI();
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
                <span class="rank-score">${this.currentCriteria === 'clears' ? `${user.clears}회 클리어` : `${user.score}점`}</span>
                <span class="rank-stat">공격력: ${user.attack}</span>
            </li>
        `).join('');
    }
}