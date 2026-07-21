# Exemplo — Conectar WhatsApp API Oficial (D-API)

Exemplo mínimo, em **HTML puro** (sem framework, sem build), de como um SaaS conecta
o número oficial do WhatsApp (Cloud API) de um cliente usando a **D-API como provedor**.

É um único arquivo (`index.html`), com a lógica inline e comentada.

## Como funciona (modelo hospedado)

O Embedded Signup da Meta **não roda no seu domínio** — a Meta exige que o domínio
esteja cadastrado no app dela, e não dá pra cadastrar o domínio de todo parceiro. Por
isso o fluxo roda numa **página hospedada pela D-API** (`https://connect.d-api.cloud/connect`),
que você abre num **popup**. São 3 passos:

1. **Popup** — você abre `connect.d-api.cloud/connect` (`window.open`).
2. **Handshake** — a página avisa `dapi-connect-ready`; você responde com a sua
   **publishable key** (`postMessage`). A origem do seu site é verificada pelo browser.
3. **Resultado** — a D-API roda o Embedded Signup, provisiona a conexão e devolve
   `{ connectionId, phoneNumber, status }` por `postMessage`.

> O **seu domínio não precisa ser cadastrado na Meta** — quem é cadastrado é o
> domínio da D-API. Você só precisa: uma publishable key, e a sua origem na
> allowlist dessa key.

A publishable key é **pública de propósito**: só inicia o onboarding, travada por
lista de origens + rate limit. A sua API key **secreta** nunca vai para o navegador.

## Pré-requisitos

1. Uma **publishable key** com a origem deste exemplo na allowlist:
   ```bash
   curl -X POST https://api.d-api.cloud/api/v1/connections/cloud-api/publishable-keys \
     -H "Authorization: <SUA_API_KEY_SECRETA>" \
     -H "content-type: application/json" \
     -d '{"allowedOrigins":["http://localhost:8000"]}'
   ```
   A resposta traz o `key` (`pk_live_...`) **uma única vez** — copie.

2. A **origem** de onde você abre o exemplo (ex.: `http://localhost:8000`) precisa
   estar em `allowedOrigins`. Senão, a D-API responde `403 Origin not allowed`.

## Como rodar

Sirva a pasta por HTTP (não `file://` — precisa de uma origem estável):

```bash
cd official-api-connect-example
python3 -m http.server 8000    # ou: npx serve -l 8000
```

Abra <http://localhost:8000>, cole a publishable key e clique em **Conectar**.
Para testar contra o **sandbox**, troque o campo "Base do connect hospedado" para
`https://connect-c2.d-api.cloud`.

## Equivalente com o SDK

Este exemplo faz o handshake "na mão" para ser didático. O pacote `d-api-sdk` faz
o mesmo em uma chamada:

```js
import { DApiConnect } from "d-api-sdk/connect";

const connect = new DApiConnect({ publishableKey: "pk_live_…" });
const { connectionId } = await connect.start({ webhookUrl: "https://seu-saas.com/hooks/dapi" });
```

> Nota: nenhuma configuração da Meta (App ID / config_id) fica no seu código — isso
> tudo vive na página hospedada da D-API.
