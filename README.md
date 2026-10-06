# Navalha Barber Club

Sistema full stack de agendamento para barbearias, com áreas para cliente, barbeiro e administração. O projeto conecta uma interface responsiva a uma API REST e a um banco PostgreSQL, com autenticação, controle de acesso e regras para evitar reservas sobrepostas.

A interface foi implementada a partir do [design no Figma](https://www.figma.com/design/Hr2YUttM7pzssCukvJKs6Y?node-id=41-2), com CSS próprio, ícones locais e temas claro e escuro.

## Tecnologias

| Camada | Tecnologias |
| --- | --- |
| Frontend | React 19, TypeScript, Vite e React Router |
| Backend | Node.js, TypeScript, Express 5 e Zod |
| Banco de dados | PostgreSQL 17, biblioteca `pg` e migrações SQL |
| Ambiente local | Docker Compose; PGlite como alternativa de desenvolvimento |
| Testes | Node Test Runner e Supertest |

## Funcionalidades

### Cliente

- Cadastro, login por e-mail ou telefone, logout e edição de perfil.
- Consulta dos próximos agendamentos e do histórico de atendimentos.
- Reserva em quatro etapas: serviço, barbeiro, data/horário e confirmação.
- Remarcação e cancelamento das próprias reservas, com pelo menos duas horas de antecedência.

### Barbeiro

- Agenda diária e semanal com os próprios atendimentos.
- Criação de agendamentos para clientes cadastrados.
- Bloqueio e liberação de horários.
- Confirmação, conclusão e cancelamento de atendimentos.

### Administração

- Painel com agendamentos do dia, faturamento previsto, ticket médio e ocupação da equipe.
- Visualização do movimento da semana e dos próximos atendimentos.
- Gestão de clientes, barbeiros, serviços e agendamentos.
- Busca, filtros, ordenação e paginação nas listagens.

### Autenticação e regras de negócio

- Sessões persistidas no banco, com cookies HttpOnly e senhas protegidas com `scrypt`.
- Rotas protegidas no frontend e autorização por perfil e propriedade dos dados na API.
- Preço e duração do serviço obtidos no servidor; valores monetários armazenados em centavos.
- Disponibilidade calculada considerando reservas, bloqueios e horário de funcionamento.
- Transações e bloqueios no banco para impedir reservas simultâneas sobrepostas.
- Agendamentos no fuso `America/Sao_Paulo`, de segunda a sábado, das 09h às 19h.

## Capturas de tela

Capturas reais da aplicação, com dados de demonstração.

### Área do cliente

![Área do cliente com próximos agendamentos e histórico](docs/screenshots/01-area-do-cliente.png)

<details>
<summary>Agendamento: escolha de data e horário</summary>

![Agendamento com calendário, horários disponíveis e resumo da reserva](docs/screenshots/02-agendamento.png)

</details>

<details>
<summary>Área do barbeiro</summary>

![Agenda do barbeiro com disponibilidade e ações sobre atendimentos](docs/screenshots/03-area-do-barbeiro.png)

</details>

<details>
<summary>Painel administrativo</summary>

![Painel administrativo com indicadores, movimento semanal e ocupação](docs/screenshots/04-painel-administrativo.png)

</details>

<details>
<summary>Gestão de agendamentos</summary>

![Listagem administrativa de agendamentos com busca, filtros e paginação](docs/screenshots/05-gestao-de-agendamentos.png)

</details>

## Executar com PostgreSQL e Docker

Este é o ambiente principal do projeto. O PostgreSQL roda em Docker; o frontend e a API rodam no computador com Node.js.

### Pré-requisitos

- Node.js **22.14 ou superior**, com npm.
- Docker Desktop aberto, com o mecanismo de contêineres Linux em execução, ou Docker Engine com Compose em outro sistema.
- Portas locais **5173**, **3001** e **5433** disponíveis.

Abra o terminal na pasta que contém este `README.md`, `package.json` e `compose.yaml`.

### Primeira execução no Windows (PowerShell)

```powershell
npm install

if (-not (Test-Path -LiteralPath 'server/.env')) {
    Copy-Item -LiteralPath 'server/.env.example' -Destination 'server/.env'
}

$env:DB_ENGINE = 'postgres'
$env:NODE_ENV = 'development'

docker compose up -d --wait db
npm run db:migrate
npm run db:seed
npm run dev
```

Se `server/.env` já existir, confira sua conexão antes de executar os comandos. Para o banco definido no Compose, use:

```dotenv
DB_ENGINE=postgres
DATABASE_URL=postgresql://navalha:navalha_local@127.0.0.1:5433/navalha
```

No Linux ou macOS, copie `server/.env.example` para `server/.env` em uma instalação nova, mantenha `DB_ENGINE=postgres` e `NODE_ENV=development` no arquivo e execute os mesmos comandos `npm` e `docker compose` do exemplo.

`db:migrate` cria a estrutura do banco. `db:seed` prepara as contas, os serviços e os agendamentos de demonstração; ele também executa as migrações. `npm run dev` inicia a API e o frontend juntos.

| Serviço | Endereço |
| --- | --- |
| Aplicação | <http://127.0.0.1:5173> |
| API | <http://127.0.0.1:3001/api> |
| Verificação da API e do banco | <http://127.0.0.1:3001/api/health> |
| PostgreSQL no computador | `127.0.0.1:5433` |

O banco usa a porta **5433** no computador e **5432** dentro do contêiner. O Vite encaminha `/api` para a API na porta 3001, mantendo os cookies na mesma origem.

### Conferir, encerrar e iniciar novamente

```powershell
docker compose ps
Invoke-RestMethod -Uri 'http://127.0.0.1:3001/api/health'
```

O serviço `db` deve aparecer como `healthy`. A API deve responder com `status: ok` e `database: postgres`.

Para encerrar o frontend e a API, pressione `Ctrl+C` no terminal. Para parar o banco preservando os dados:

```sh
docker compose stop db
```

Para iniciar novamente no PowerShell:

```powershell
$env:DB_ENGINE = 'postgres'
$env:NODE_ENV = 'development'
docker compose up -d --wait db
npm run dev
```

Os dados permanecem no volume `postgres_data`. Não é necessário executar a carga inicial a cada reinício.

### Problemas comuns

| Mensagem ou situação | Como resolver |
| --- | --- |
| `failed to connect ... dockerDesktopLinuxEngine` | Abra o Docker Desktop, aguarde o mecanismo Linux iniciar e confirme que `docker info` responde. Depois repita `docker compose up -d --wait db`. |
| Conexão recusada em `5433` | Confira `docker compose ps` e a `DATABASE_URL` em `server/.env`. A porta do Compose é 5433. |
| Vite informa que a porta `5173` está ocupada | Encerre a outra instância do frontend no terminal em que ela foi iniciada e execute `npm run dev` novamente. |
| O terminal diz que o banco é `pglite` | Execute `$env:DB_ENGINE = 'postgres'` antes de iniciar e confira a configuração de `server/.env`. |

## Contas de demonstração

Disponíveis após `npm run db:seed`:

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Cliente | joao@email.com | Navalha123! |
| Barbeiro | marcos@navalha.com | Navalha123! |
| Administração | ana@navalha.com | Navalha123! |

A carga inicial cria agendamentos relativos à data em que o banco é preparado. Os indicadores e as datas podem variar em relação às capturas. O cadastro público cria apenas contas de cliente.

## Alternativa local sem Docker

Para desenvolvimento, o projeto também suporta PGlite, que executa PostgreSQL em WebAssembly e persiste os dados em `server/.data`.

Com o servidor parado, na raiz do projeto, execute no PowerShell:

```powershell
$env:DB_ENGINE = 'pglite'
$env:NODE_ENV = 'development'
npm install
npm run db:seed
npm run dev
```

Essas variáveis valem para o terminal atual. `PGLITE_PATH` permite escolher outro diretório de dados. Para voltar ao banco do Docker, pare a aplicação e siga os comandos de reinício com `DB_ENGINE=postgres`. Cada modo usa seu próprio banco; trocar o modo não transfere os dados.

PGlite é destinado ao desenvolvimento e aos testes. A execução em produção exige PostgreSQL convencional.

## Configuração

As variáveis da API ficam em `server/.env`, criado a partir de `server/.env.example`.

| Variável | Uso |
| --- | --- |
| `PORT` | Porta da API; padrão `3001`. |
| `NODE_ENV` | `development` localmente; `production` na implantação. |
| `DB_ENGINE` | `postgres` para o banco convencional ou `pglite` no desenvolvimento. |
| `DATABASE_URL` | Conexão PostgreSQL; obrigatória no modo `postgres`. |
| `APP_ORIGIN` | Origens permitidas, separadas por vírgulas; o exemplo inclui os endereços locais. |
| `SESSION_DAYS` | Duração das sessões em dias; padrão `7`. |
| `AUTO_SEED` | Carga de demonstração na inicialização; desativada por padrão (`false`). |
| `PGLITE_PATH` | Diretório opcional dos dados PGlite; padrão `.data` dentro de `server`. |

Variáveis definidas no terminal têm prioridade sobre o arquivo `.env`.

## Testes e build

```sh
npm test
npm run build
```

A suíte contém **10 testes da API**, com banco PGlite isolado. Ela verifica autenticação, permissões, cadastro, reservas concorrentes, remarcação, cancelamento, bloqueios, cadastros administrativos, recuperação de senha e persistência. Os testes não dependem do banco Docker da aplicação.

Os fluxos foram verificados em desktop e celular. Também foi validado, no PostgreSQL convencional, que duas reservas simultâneas para o mesmo horário resultam em uma reserva aceita e outra recusada por conflito.

O build gera `client/dist` e `server/dist`. Para conferir a versão compilada localmente, com o banco iniciado:

```sh
npm start
```

A API passa a servir o frontend compilado em <http://127.0.0.1:3001>.

## Estrutura do projeto

```text
navalha-barber-club/
├── client/
│   ├── public/assets/       Ícones e recursos locais
│   └── src/
│       ├── components/     Componentes e layouts compartilhados
│       ├── features/       Telas de autenticação, cliente e equipe
│       └── lib/            API, autenticação, tema, tipos e formatação
├── server/
│   ├── migrations/         Estrutura SQL do banco
│   ├── src/                API, segurança, banco e regras de agendamento
│   ├── test/               Testes da API
│   └── .env.example        Exemplo de configuração
├── docs/screenshots/       Cinco capturas reais da aplicação
├── compose.yaml            PostgreSQL local com volume persistente
└── package.json            Comandos e workspaces do projeto
```

## Escopo e implantação

Esta versão não integra pagamentos ou lembretes. O Clube Navalha apresenta a contagem de visitas concluídas. A recuperação de senha funciona em desenvolvimento com um link exibido na tela e no terminal da API; o envio de e-mail ainda não está implementado. Em produção, essa opção orienta a pessoa a entrar em contato com a barbearia.

Para implantar, configure PostgreSQL, HTTPS, `NODE_ENV=production`, `APP_ORIGIN` com a origem pública da aplicação e credenciais próprias. Mantenha `AUTO_SEED=false`; a carga de demonstração é bloqueada em produção.

Para criar a primeira conta administrativa, defina `ADMIN_EMAIL`, `ADMIN_NAME` e `ADMIN_PASSWORD` no ambiente do servidor e execute, na raiz:

```sh
npm run db:admin -w server
```

A senha administrativa exige pelo menos 12 caracteres, incluindo letra e número. As contas de demonstração são destinadas ao desenvolvimento local.
