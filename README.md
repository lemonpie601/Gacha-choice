# Gacha Choice · 가챠 포지 대답 선택지

마리나라 엔진의 **가챠 포지(Gacha Forge)** 스토리에 원신 같은 **주인공 대답 선택지**를 추가하는 비공식 런타임 패치와 설정용 개인 확장입니다.

- 누군가 주인공에게 말을 걸면 대답 선택지가 2~3개 뜹니다.
- 고른 답에 따라 **바로 뒤 1~3줄만** 달라지고, 이후에는 같은 이야기로 이어집니다.
- 스토리 진행, 보상, 호감도 같은 게임 결과는 바뀌지 않습니다. 분위기를 내기 위한 기능입니다.
- 선택지 버튼은 **설정 → 외형 · 화면 → UI 스타일**(오로라 · 블룸 · 시그널 · 엠버 · 뱅가드)에 맞춰 모양과 색이 바뀝니다.
- 얼마나 자주 나올지는 가챠 포지 **설정** 왼쪽 목록에 새로 생기는 **스토리 · 대답 선택지** 항목에서 **자주 / 가끔 / 끄기**로 고릅니다(확장 필요).

엔진과 가챠 포지 원본 파일은 수정하지 않고, 서버가 켜질 때 메모리에서만 바꿉니다. 패치를 빼면 원래대로 돌아갑니다.

| 파일 | 역할 | 필수 |
| --- | --- | --- |
| `gacha-choice-runtime.cjs` | 서버 런타임 패치. 선택지를 만들고, 저장하고, 화면에 그립니다. | 필수 |
| `manifest.json` · `extension.js` | 개인 확장. 가챠 포지 설정 목록에 “대답 선택지” 항목을 추가합니다. 플로팅 버튼은 만들지 않습니다. | 선택 (없으면 항상 “자주”) |
| `gacha-choice-selftest.cjs` | 설치 전에 패치가 맞는지 확인하는 자가 진단 | 확인용 |

## 동작 방식

| 위치 | 바뀌는 것 |
| --- | --- |
| 스토리 생성 프롬프트 | 원래 있던 “선택지를 절대 내지 말 것” 문장을 “결과가 바뀌지 않는 대답 선택지를 장면당 최대 1개까지 넣어도 됨”으로 바꿉니다. 빈도가 **끄기**이면 원래 문장 그대로 둡니다. |
| 빈도 설정 | `GET/POST /api/gacha-forge/choice-settings`로 읽고 바꿉니다. 데이터 폴더의 `gacha-choice-settings.json`에 저장되어, 기기를 바꾸거나 자동 진행으로 장면이 만들어질 때도 같은 설정이 쓰입니다. |
| 장면 저장 | AI가 만든 선택지(`choice`)를 장면 데이터에 함께 저장합니다. 형식이 잘못됐거나 장면의 마지막 줄에 붙은 선택지는 버립니다. |
| 스토리 화면 | 선택지가 붙은 줄에서 버튼을 띄우고, 고른 답의 대사를 보여 준 뒤 다음 줄로 이어 갑니다. |

- 대사 번호(`09 / 91`)는 분기 대사가 나오는 동안에도 그대로 유지됩니다.
- 선택지는 마우스, **마우스 휠**, **↑ / ↓ 화살표**로 고르고, **선택 키**(기본 **F**) 또는 Enter, 클릭으로 정합니다. 강조된 선택지에는 선택 키 표시가 붙습니다. 한글 입력 상태에서도 선택 키가 동작합니다.
- 선택 키는 설정의 **대답 선택지 → 선택 키 → 바꾸기**를 누른 뒤 원하는 키를 누르면 바뀝니다(Esc: 취소, **기본값 (F)**: 되돌리기). ↑ / ↓, Enter, Tab, Esc 같은 키는 쓸 수 없습니다. 이 기기(브라우저)에만 저장되므로 기기마다 따로 정할 수 있습니다. 선택지가 떠 있을 때만 키를 받고, 글을 입력하는 중이거나 백로그를 연 동안에는 받지 않습니다.
- **자동** 모드는 선택지에서 멈췄다가, 답을 고르면 다시 이어 갑니다. **건너뛰기**를 누르면 선택지도 함께 건너뜁니다.
- 다시 읽기를 하면 선택지가 다시 뜹니다. 선택지는 장면과 함께 저장되므로 새로고침해도 사라지지 않습니다.
- 분기 대사는 다음 장면을 쓸 때 AI에게 전달되는 “지금까지의 이야기”에 포함되지 않습니다. 그래서 스토리에 영향을 주지 않습니다.
- 패치를 적용하기 **전에** 만들어진 장면에는 선택지가 없습니다. 새로 만드는 장면부터 나옵니다.
- 어떤 답을 **골랐는지**는 저장하지 않습니다. 다시 읽으면 처음부터 다시 고릅니다.

## 지원 버전

- 마리나라 엔진 2.5.1 / **Gacha Forge 1.8.13**에서 확인했습니다. 기존 Windows 로컬 패치(한국어 스탠딩, CG, NovelAI 지연, customizer, WebP)와 함께 켠 상태에서 테스트했습니다.
- 다른 버전에서는 고칠 위치를 찾지 못하면 **아무것도 바꾸지 않고** 로그에 `[gacha-choice] ... signature mismatch`를 남깁니다. 게임은 원래대로 동작합니다.

## 설치 (Windows 로컬 설치)

원격 서버나 Docker로 운영한다면 아래 [설치 (SSH 서버 · Docker Compose)](#설치-ssh-서버--docker-compose)를 보세요.

1. `gacha-choice-runtime.cjs`와 `gacha-choice-selftest.cjs`를 `Marinara-Engine` 폴더(보통 `%LOCALAPPDATA%\Marinara-Engine`)에 넣습니다.
2. 먼저 자가 진단을 실행합니다. 설치된 가챠 포지에 패치가 맞는지 파일을 바꾸지 않고 확인합니다.

   ```bat
   cd /d %LOCALAPPDATA%\Marinara-Engine
   node gacha-choice-selftest.cjs
   ```

   `PASS:` 세 줄이 나오면 정상입니다. 오류가 나오면 다음 단계로 진행하지 마세요.
3. `.env`를 백업한 뒤, `NODE_OPTIONS=` 줄 **끝에** 아래 내용을 한 칸 띄우고 추가합니다. 기존 `--require` 항목은 지우지 마세요.

   ```text
   --require=C:/Users/<사용자이름>/AppData/Local/Marinara-Engine/gacha-choice-runtime.cjs
   ```

   다른 패치와 순서는 상관없습니다(앞·뒤 어느 쪽에 두어도 함께 적용되는 것을 확인했습니다).

4. 마리나라 엔진을 다시 시작합니다. 서버 로그에 아래 두 줄이 보이면 적용된 것입니다.

   ```text
   [gacha-choice] route hooked for VN choices (in memory)
   [gacha-choice] reply choices enabled in beat prompt (in memory)
   ```

   서버 로그는 가챠 포지 화면을 한 번 열어야 두 번째 줄까지 나올 수 있습니다.
5. (선택) 빈도·선택 키 설정 화면을 쓰려면 Marinara의 **GitHub 확장 관리자**에 아래 주소를 등록하고 확장을 설치·활성화합니다.

   ```text
   https://github.com/lemonpie601/Gacha-choice
   ```

   가챠 포지 **설정** 왼쪽 목록의 “서술 · 고급” 아래에 **스토리 · 대답 선택지** 항목이 생깁니다. 커스터마이저 탭과 같은 방식이라 함께 써도 서로 겹치지 않습니다. 서버 패치 없이 확장만 설치하면 “서버 패치가 적용되어 있지 않습니다”라고 표시됩니다.

## 설치 (SSH 서버 · Docker Compose)

마리나라를 원격 서버의 Docker로 운영하는 경우입니다. 서버에 **SSH로 접속**한 뒤 진행해 주세요. 예시는 `/root/Marinara-Engine` 설치를 기준으로 합니다. 다른 경로라면 바꿔서 입력하세요.

> 이 절차는 Windows 로컬 설치에서 검증한 패치 파일과 경로 구조(`/app/...`, `DATA_DIR=/app/data`)를 기준으로 작성했습니다. Docker 서버에서 직접 실행해 확인하지는 않았습니다. 각 단계의 확인 결과가 예시와 다르면 다음 단계로 진행하지 마세요.

### 1. 프로젝트 폴더로 이동

```bash
cd /root/Marinara-Engine || exit 1
```

### 2. GitHub에서 패치 받기

```bash
curl -fL --retry 3 -o gacha-choice-runtime.cjs \
  https://raw.githubusercontent.com/lemonpie601/Gacha-choice/main/gacha-choice-runtime.cjs
curl -fL --retry 3 -o gacha-choice-selftest.cjs \
  https://raw.githubusercontent.com/lemonpie601/Gacha-choice/main/gacha-choice-selftest.cjs
ls -lh gacha-choice-runtime.cjs gacha-choice-selftest.cjs
```

두 파일이 모두 보이면 정상입니다. `curl: (22)`나 `404`가 나오면 진행하지 마세요.

### 3. 설정 백업 후 추가

아래 스크립트는 `docker-compose.override.yml`을 백업한 뒤 **필요한 두 가지만** 추가합니다.

- 패치 파일 두 개를 컨테이너의 `/app`에 읽기 전용으로 연결
- `NODE_OPTIONS` 끝에 `--require=/app/gacha-choice-runtime.cjs` 추가

`override` 파일이 없으면 새로 만듭니다. 이미 다른 런타임 패치(`.cjs`)를 쓰고 있으면 그 설정 뒤에 덧붙입니다. 형식이 예상과 다르면 **아무것도 바꾸지 않고 멈춥니다**.

> Marinara 이미지는 기본으로 `NODE_OPTIONS="--max-old-space-size=4096"`을 씁니다. compose에서 `NODE_OPTIONS`를 지정하면 이 기본값이 사라지므로, 새로 만들 때는 이 값을 함께 넣습니다.

```bash
cd /root/Marinara-Engine || exit 1

python3 - <<'PY'
from pathlib import Path
from datetime import datetime
import re, shutil

config = Path("docker-compose.override.yml")
for f in ("gacha-choice-runtime.cjs", "gacha-choice-selftest.cjs"):
    if not Path(f).is_file():
        raise SystemExit(f + " 파일이 없습니다. 2단계를 먼저 진행하세요.")
mounts = ["./gacha-choice-runtime.cjs:/app/gacha-choice-runtime.cjs:ro",
          "./gacha-choice-selftest.cjs:/app/gacha-choice-selftest.cjs:ro"]
flag = "--require=/app/gacha-choice-runtime.cjs"

if not config.exists():
    config.write_text(
        "services:\n  marinara:\n    volumes:\n"
        + "".join("      - " + m + "\n" for m in mounts)
        + "    environment:\n"
        + '      NODE_OPTIONS: "--max-old-space-size=4096 ' + flag + '"\n')
    print("새 docker-compose.override.yml을 만들었습니다.")
    raise SystemExit(0)

original = config.read_text()
if "gacha-choice-runtime.cjs" in original:
    raise SystemExit("이미 설치되어 있습니다. 중복 추가하지 않습니다.")

# 기존 런타임 패치 마운트(./xxx.cjs:/app/xxx.cjs) 중 마지막 줄 뒤에 추가합니다.
mount_lines = list(re.finditer(r'(?m)^([ \t]*)- \./[^\s:]+\.cjs:/app/[^\s:]+\.cjs(:ro)?[ \t]*(?=\r?$)', original))
# NODE_OPTIONS: "..." 또는 - NODE_OPTIONS=... 형식 한 줄만 허용합니다.
OPT = r'(?m)^([ \t]*(?:NODE_OPTIONS:[ \t]*"|- "?NODE_OPTIONS=))([^"\r\n]*)("?)[ \t]*(?=\r?$)'
nl = "\r\n" if "\r\n" in original else "\n"
opts = list(re.finditer(OPT, original))
if not mount_lines or len(opts) != 1:
    raise SystemExit("기존 설정 형식이 예상과 다릅니다. 수정하지 않았습니다. 아래 '직접 추가하기'를 참고하세요.")

last = mount_lines[-1]
indent = last.group(1)
added = "".join(nl + indent + "- " + m for m in mounts)
updated = original[:last.end()] + added + original[last.end():]
opt = list(re.finditer(OPT, updated))[0]
updated = updated[:opt.start(2)] + opt.group(2).rstrip() + " " + flag + updated[opt.end(2):]

backup = config.with_name(config.name + ".backup." + datetime.now().strftime("%Y%m%d-%H%M%S"))
shutil.copy2(config, backup)
config.write_text(updated)
print("기존 설정 백업:", backup)
print("기존 NODE_OPTIONS 유지 + 대답 선택지 패치 추가 완료")
PY
```

**직접 추가하기** (스크립트가 멈춘 경우): `docker-compose.override.yml`의 `marinara` 서비스에 아래 내용을 **병합**하세요. 파일을 통째로 덮어쓰지 마세요. 이미 `NODE_OPTIONS`가 있다면 새 줄을 만들지 말고 기존 값 끝에 `--require=/app/gacha-choice-runtime.cjs`만 덧붙입니다.

```yaml
services:
  marinara:
    volumes:
      - ./gacha-choice-runtime.cjs:/app/gacha-choice-runtime.cjs:ro
      - ./gacha-choice-selftest.cjs:/app/gacha-choice-selftest.cjs:ro
    environment:
      NODE_OPTIONS: "--max-old-space-size=4096 --require=/app/gacha-choice-runtime.cjs"
```

### 4. 설정 확인과 자가 진단

```bash
docker compose config -q && echo "Docker 설정 정상"
docker compose run --rm --no-deps --entrypoint node marinara /app/gacha-choice-selftest.cjs /app
```

**정상 출력 예시**

```text
Docker 설정 정상
PASS: server, client and route patches apply to Gacha Forge 1.8.13 and parse
PASS: beat parser keeps one valid choice per beat and drops broken ones
PASS: choice frequency (often / sometimes / off) reaches the beat prompt and has a settings route
```

자가 진단은 데이터 볼륨에 설치된 가챠 포지 파일을 읽기만 합니다. `PASS`가 세 줄 나오지 않으면 다음 단계로 진행하지 마세요.

### 5. 컨테이너 재생성

```bash
docker compose up -d --force-recreate marinara
docker compose ps
```

`marinara` 서비스가 `Up`이면 실행 중입니다.

### 6. 적용 확인

가챠 포지 화면을 한 번 연 뒤 로그를 확인합니다.

```bash
docker compose logs --since=10m marinara 2>&1 | grep 'gacha-choice'
```

**정상 출력 예시**

```text
marinara-1  | [gacha-choice] hook registered
marinara-1  | [gacha-choice] route hooked for VN choices (in memory)
marinara-1  | [gacha-choice] reply choices enabled in beat prompt (in memory)
```

`signature mismatch`가 보이면 가챠 포지 버전이 맞지 않아 **패치가 꺼진 상태**입니다. 게임은 원래대로 동작합니다.

### 업데이트

```bash
cd /root/Marinara-Engine || exit 1
cp -a gacha-choice-runtime.cjs "gacha-choice-runtime.cjs.backup.$(date +%Y%m%d-%H%M%S)"
curl -fL --retry 3 -o gacha-choice-runtime.cjs \
  https://raw.githubusercontent.com/lemonpie601/Gacha-choice/main/gacha-choice-runtime.cjs
curl -fL --retry 3 -o gacha-choice-selftest.cjs \
  https://raw.githubusercontent.com/lemonpie601/Gacha-choice/main/gacha-choice-selftest.cjs
docker compose run --rm --no-deps --entrypoint node marinara /app/gacha-choice-selftest.cjs /app \
  && docker compose up -d --force-recreate marinara
```

### 제거

3단계에서 만든 `docker-compose.override.yml.backup.*` 파일로 되돌리거나, 추가된 두 줄의 마운트와 `--require=/app/gacha-choice-runtime.cjs`를 지운 뒤 `docker compose up -d --force-recreate marinara`를 실행하세요. 3단계에서 `override` 파일을 새로 만들었다면 그 파일을 지워도 됩니다.

## 끄기

- 새 장면에만 끄려면 설정의 **대답 선택지 → 끄기**를 고르세요. 이미 만든 장면의 선택지는 그대로 나옵니다.
- 완전히 빼려면 `.env`의 `NODE_OPTIONS`에서 `--require=...gacha-choice-runtime.cjs` 부분을 지우고 엔진을 다시 시작하세요. 이미 저장된 선택지 데이터는 남지만, 패치가 없으면 화면에 보이지 않고 게임에도 영향을 주지 않습니다.

## 알려진 한계

- 선택지가 나올지, 언제 나올지는 AI가 정합니다. 모델에 따라 거의 안 나오거나 어색할 수 있습니다. 테스트에서는 “자주” 설정으로 만든 83줄짜리 장면에 선택지 1개(답 3개, 각 2줄)가 들어갔고, 장면 생성은 실패 없이 끝났습니다.
- 로그(Backlog)에는 고른 분기 대사가 표시되지 않습니다.
- 가챠 포지가 업데이트되면 이 패치도 새 버전에 맞게 고쳐야 합니다. 맞지 않으면 위에서 말한 것처럼 자동으로 꺼집니다.
