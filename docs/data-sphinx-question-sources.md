# 데이터 스핑크스 문제은행 출처

이 문서는 `data/battle/data-sphinx.json`의 O/X 문제 100개를 검증하기 위한 출처 목록이다. 2026-09-10 기준으로 대학·정부·표준화 기구·공식 프로젝트 문서처럼 원문 사실을 확인할 수 있는 자료를 우선했다. X 문항은 출처의 사실에서 연도·용어·성질 하나를 명확하게 바꾼 문장이다.

## 구성

| 문항 ID | 분야 | 문항 수 | O | X |
| --- | --- | ---: | ---: | ---: |
| 1~22 | 이화여자대학교 | 22 | 11 | 11 |
| 23~52 | 인공지능·데이터사이언스 | 30 | 15 | 15 |
| 53~82 | 컴퓨터공학·사이버보안 | 30 | 15 | 15 |
| 83~100 | 대한민국 기초교양 | 18 | 9 | 9 |
| 합계 |  | 100 | 50 | 50 |

전투는 기존 공식대로 정답 10개면 끝난다. 매 도전에서 100개를 섞으므로 첫 10개만 반복되지 않는다.

## 이화여자대학교

| 문항 ID | 확인 내용 | 공식 출처 |
| --- | --- | --- |
| 1~2 | 이화학당 명칭 하사, 대학과 신설 | [이화학당 시대 연혁](https://www.ewha.ac.kr/ewha/intro/history01-1.do) |
| 3, 11~15 | 신촌 이전, 캠퍼스 건축, 피난학교, 이화역사관, ECC | [캠퍼스 역사](https://www.ewha.ac.kr/ewha/intro/history-campus.do) |
| 4~5 | 종합대학교 인가, 여자대학원 설립 | [이화 140주년 역사](https://140.ewha.ac.kr/ewha140/history/history.do) |
| 6 | 공과대학 설립 | [공과대학 대학정보](https://www.ewha.ac.kr/ewha/academics/engineering.do?uniNo=204) |
| 7 | 영문 교명 `EWHA WOMANS UNIVERSITY` | [교명 소개](https://www.ewha.ac.kr/ewha/intro/school-name.do) |
| 8, 21 | 교훈 진·선·미와 의미 | [교훈 소개](https://www.ewha.ac.kr/ewha/intro/motto.do) |
| 9 | 교가 작사자 | [교가 소개](https://www.ewha.ac.kr/ewha/intro/song.do) |
| 10 | 이화여자대학교박물관 개관 | [박물관 소개](https://www.ewha.ac.kr/ewha/intro/organ03.do?uniNo=475) |
| 16 | 자연사박물관 설립 | [자연사박물관 소개](https://cms.ewha.ac.kr/user/indexSub.action?codyMenuSeq=82810&siteId=nhm) |
| 17 | 도서관 개관과 이전 | [이화여자대학교 도서관 이용안내](https://lib.ewha.ac.kr/file/web_bro/ko/korGuide2023.pdf) |
| 18~20 | 교표의 배꽃 모티프·연도·두 원 | [교표 소개](https://www.ewha.ac.kr/ewha/intro/symbol01.do) |
| 22 | 교육대학원 개원 | [교육대학원 대학정보](https://www.ewha.ac.kr/ewha/academics/ged.do) |

## 인공지능·데이터사이언스

| 문항 ID | 확인 내용 | 공식 출처 |
| --- | --- | --- |
| 23, 25 | AI RMF의 자발성·산업 비특정성 | [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework), [NIST AI RMF 1.0](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10) |
| 24, 27 | 신뢰할 수 있는 AI 특성과 수명주기 | [NIST AI RMF FAQ](https://www.nist.gov/itl/ai-risk-management-framework/ai-risk-management-framework-faqs) |
| 26, 28 | 생성형 AI와 합성 콘텐츠의 범위 | [NIST AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) |
| 29~30 | 지도학습·비지도학습 | [NIST SP 1321](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.1321.pdf) |
| 31, 37 | 파이썬 집합 | [Python 자료구조](https://docs.python.org/3/tutorial/datastructures.html#sets) |
| 32 | 파이썬 문자열의 불변성 | [Python 문자열](https://docs.python.org/3/tutorial/introduction.html#text) |
| 33~35, 38 | 딕셔너리와 리스트 연산 | [Python 자료구조](https://docs.python.org/3/tutorial/datastructures.html) |
| 36 | `range`의 끝값 제외 | [Python 제어 흐름](https://docs.python.org/3/tutorial/controlflow.html#the-range-function) |
| 39~42, 46 | NumPy 인덱스·속성·생성·형태 변경 | [NumPy 초보자 안내서](https://numpy.org/doc/stable/user/absolute_beginners.html) |
| 43 | 정렬된 복사본 | [NumPy sort](https://numpy.org/doc/stable/reference/generated/numpy.sort.html) |
| 44~45 | 행렬곱과 원소별 곱셈 | [NumPy 빠른 시작](https://numpy.org/doc/stable/user/quickstart.html#basic-operations) |
| 47, 49 | 평가 데이터와 K-겹 교차검증 | [scikit-learn 교차검증](https://scikit-learn.org/stable/modules/cross_validation.html), [KFold](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.KFold.html) |
| 48 | 훈련·시험 데이터 분리 | [train_test_split](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.train_test_split.html) |
| 50 | 정밀도 공식 | [precision_score](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.precision_score.html) |
| 51 | 결측값 대치 | [SimpleImputer](https://scikit-learn.org/stable/modules/generated/sklearn.impute.SimpleImputer.html) |
| 52 | 범주형 원-핫 인코딩 | [OneHotEncoder](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.OneHotEncoder.html) |

## 컴퓨터공학·사이버보안

| 문항 ID | 확인 내용 | 공식 출처 |
| --- | --- | --- |
| 53 | IPv4 주소 길이 | [RFC 791](https://www.rfc-editor.org/rfc/rfc791.html) |
| 54 | IPv6 주소 길이 | [RFC 8200](https://www.rfc-editor.org/rfc/rfc8200.html#section-1) |
| 55, 57 | TCP의 신뢰성·순서·바이트 스트림 | [RFC 9293](https://www.rfc-editor.org/rfc/rfc9293.html) |
| 56 | UDP의 비보장성 | [RFC 768](https://www.rfc-editor.org/rfc/rfc768.html) |
| 58 | DNS A 레코드 | [RFC 1035](https://www.rfc-editor.org/rfc/rfc1035.html#section-3.4.1) |
| 59 | DNS의 UDP·TCP 지원 | [RFC 7766](https://www.rfc-editor.org/rfc/rfc7766.html#section-5) |
| 60 | IPv6와 브로드캐스트 | [RFC 4291](https://www.rfc-editor.org/rfc/rfc4291.html#section-2) |
| 61~64 | HTTP 메서드 성질과 URI 프래그먼트 | [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html) |
| 65 | 인증 | [NIST Authentication Glossary](https://csrc.nist.gov/glossary/term/authentication) |
| 66 | 권한 부여 | [NIST Authorization Glossary](https://csrc.nist.gov/glossary/term/authorization) |
| 67 | 최소 권한 | [NIST Least Privilege Glossary](https://csrc.nist.gov/glossary/term/least_privilege) |
| 68 | HTML `id`의 고유성 | [WHATWG HTML Standard](https://html.spec.whatwg.org/multipage/dom.html#the-id-attribute) |
| 69 | CSS 속성의 상속 여부 | [W3C CSS Cascading and Inheritance](https://www.w3.org/TR/css-cascade-5/#inheriting) |
| 70~72 | 엄격한 동등 비교와 `const` | [ECMAScript Language Specification](https://tc39.es/ecma262/) |
| 73~75 | 파이썬 가변성·불변성·객체 동일성 | [Python Data Model](https://docs.python.org/3/reference/datamodel.html), [Python Expressions](https://docs.python.org/3/reference/expressions.html#identity-comparisons) |
| 76 | SHA-256 다이제스트 길이 | [NIST FIPS 180-4](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf) |
| 77 | 공개키 암호 | [NIST Public Key Cryptography Glossary](https://csrc.nist.gov/glossary/term/public_key_cryptography) |
| 78 | 디지털 서명 | [NIST Digital Signature Glossary](https://csrc.nist.gov/glossary/term/digital_signature) |
| 79~80 | 다중 요소 인증 | [NIST MFA Glossary](https://csrc.nist.gov/glossary/term/multi_factor_authentication) |
| 81 | 매개변수화 쿼리 | [OWASP SQL Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html) |
| 82 | Base64 데이터 인코딩 | [RFC 4648](https://www.rfc-editor.org/rfc/rfc4648.html#section-4) |

## 대한민국 기초교양

| 문항 ID | 확인 내용 | 공식 출처 |
| --- | --- | --- |
| 83~88 | 태극기·국화·국가 | [대한민국 공식 홈페이지 국가 개요](https://www.korea.net/AboutKorea/OverviewofKorea), [행정안전부 국가상징](https://www.mois.go.kr/chd/sub/a05/country/screen.do) |
| 89~92 | 민주공화국·주권·영토·침략 전쟁 부인 | [국가법령정보센터 대한민국헌법](https://www.law.go.kr/LSW/lsSc.do?dt=20201211&menuId=1&query=%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD+%ED%97%8C%EB%B2%95&subMenuId=15) |
| 93~94 | 훈민정음 창제 연도와 글자 수 | [국립한글박물관 상설 전시](https://www.hangeul.go.kr/exhi/dailyExhibition.do?curr_menu_cd=0102010000) |
| 95~97 | 한글날·제헌절·광복절 | [국가법령정보센터 국경일법](https://law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=900257794) |
| 98~100 | 창덕궁·종묘·제주 화산섬과 용암동굴 | [UNESCO 대한민국 세계유산 목록](https://whc.unesco.org/en/statesparties/kr), [종묘](https://whc.unesco.org/en/list/738/), [제주 화산섬과 용암동굴](https://whc.unesco.org/en/list/1264) |
