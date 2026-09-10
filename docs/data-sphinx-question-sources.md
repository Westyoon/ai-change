# 데이터 스핑크스 문제은행 출처

이 문서는 `data/battle/data-sphinx.json`의 O/X 문제 100개를 검증하기 위한 출처와 편집 기준을 기록한다. 3초 안에 읽고 판단하는 축제 게임에 맞춰 전공 용어·세부 연도·함정형 표현을 없애고, 짧은 입문 문제와 기본 상식으로 구성했다.

## 구성

| 문항 ID | 분야 | 문항 수 | O | X |
| --- | --- | ---: | ---: | ---: |
| 1~8 | 이화여자대학교 | 8 | 4 | 4 |
| 9~12 | 인공지능 기초 | 4 | 2 | 2 |
| 13~16 | 데이터 기초 | 4 | 2 | 2 |
| 17~20 | 컴퓨터 기초 | 4 | 2 | 2 |
| 21~24 | 사이버보안 기초 | 4 | 2 | 2 |
| 25~40 | 대한민국 기초 상식 | 16 | 8 | 8 |
| 41~52 | 생활 수학 | 12 | 6 | 6 |
| 53~68 | 기초 과학·자연 | 16 | 8 | 8 |
| 69~80 | 세계·지리 | 12 | 6 | 6 |
| 81~100 | 생활·문화 | 20 | 10 | 10 |
| 합계 | 전공 16개·이화 8개·기본 상식 76개 | 100 | 50 | 50 |

전투는 정답 10개면 끝나며 매 도전에서 문제은행 전체를 섞는다. 화면에는 문제은행 크기를 진행률처럼 표시하지 않고 현재 문제 번호만 표시한다.

## 사실 확인 자료

| 문항 ID | 확인 내용 | 출처 |
| --- | --- | --- |
| 1~8 | 소재지, 이화학당의 시작, 교훈, ECC | [이화 연혁](https://www.ewha.ac.kr/ewha/intro/history01-1.do), [캠퍼스 역사](https://www.ewha.ac.kr/ewha/intro/history-campus.do), [교훈](https://www.ewha.ac.kr/ewha/intro/motto.do) |
| 9~12 | AI의 학습과 생성형 AI의 범위·한계 | [NIST 인공지능](https://www.nist.gov/artificial-intelligence), [NIST 생성형 AI 프로그램](https://www.nist.gov/itl/ai-risk-management-framework/generative-artificial-intelligence) |
| 13~16 | 평균, 결측값, 시각화, 데이터 품질 | [NIST/SEMATECH 통계 안내서](https://www.itl.nist.gov/div898/handbook/) |
| 17~20 | 이진 표현, CPU, 입력 장치, RAM | [NIST 컴퓨터 보안 용어집](https://csrc.nist.gov/glossary) |
| 21~24 | 고유 비밀번호, 피싱 링크, 보안 업데이트 | [CISA Secure Our World](https://www.cisa.gov/secure-our-world) |
| 25~40 | 수도·국가상징·국경일·헌법 | [대한민국 국가 개요](https://www.korea.net/AboutKorea/OverviewofKorea), [행정안전부 국가상징](https://www.mois.go.kr/chd/sub/a05/country/screen.do), [국가법령정보센터 대한민국헌법](https://www.law.go.kr/법령/대한민국헌법) |
| 41~52 | 단위와 기초 산술·도형 | [BIPM 국제단위계 안내서](https://www.bipm.org/en/publications/si-brochure) |
| 53~68 | 지구·달·빛·물·생물 기초 | [NASA Earth Facts](https://science.nasa.gov/earth/facts/), [NASA Moon Facts](https://science.nasa.gov/moon/facts/), [USGS 물의 과학](https://www.usgs.gov/special-topics/water-science-school) |
| 69~80 | 대양·대륙·국가와 수도 | [CIA World Factbook](https://www.cia.gov/the-world-factbook/), [NOAA Ocean Service](https://oceanservice.noaa.gov/facts/bigocean.html) |
| 81~100 | 신호등, 생활 도구, 날짜, 악기·운동·공공시설 | 일상적인 명칭과 용도만 사용했으며 전문 지식·시사 사실은 포함하지 않음 |

## 편집 기준

- 문장은 3초 안에 읽을 수 있도록 32자 이하로 유지한다.
- 전문 약어, 라이브러리 API, 수식 암기, 세부 연도 문제는 넣지 않는다.
- X 문항은 단어 하나를 억지로 비트는 함정보다 초보자도 이해할 수 있는 명확한 반대 사실을 쓴다.
- `항상`, `무조건`, `모두` 같은 절대어가 정답 힌트가 되지 않도록 남용하지 않는다.
- 총 문항 수와 O/X 비율은 자동 테스트로 고정한다.
