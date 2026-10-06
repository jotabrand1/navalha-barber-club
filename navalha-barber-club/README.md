# Navalha Barber Club

Aplicação full stack em português baseada nas 10 telas do Figma fornecido: React + TypeScript + Vite, API Node.js + Express e PostgreSQL. CSS próprio com tokens, ícones originais locais, modo escuro/claro e layouts responsivos.

## Executar com PostgreSQL

Requisitos: Node.js 22.14+ e Docker em execução (ou um PostgreSQL existente).

```sh
npm install
docker compose up -d --wait db
```

Copie `server/.env.example` para `server/.env`, confira `DATABASE_URL` e execute:

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Abra http://127.0.0.1:5173. API em http://127.0.0.1:3001. O Vite encaminha `/api` para o servidor; cookies de sessão são enviados na mesma origem.

## Executar sem Docker

Para desenvolvimento local, configure `DB_ENGINE=pglite` em `server/.env`. O PGlite executa o motor real do PostgreSQL em WebAssembly e grava os dados em `server/.data`. Execute os mesmos comandos de migração, carga inicial e desenvolvimento. O modo convencional usa a biblioteca `pg` e a conexão `DATABASE_URL`; produção exige PostgreSQL externo.

## Contas de desenvolvimento

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Cliente | joao@email.com | Navalha123! |
| Barbeiro | marcos@navalha.com | Navalha123! |
| Administração | ana@navalha.com | Navalha123! |

A carga inicial contém serviços, profissionais e agendamentos de demonstração relativos à data atual. As contas são exclusivas de desenvolvimento. Cadastros públicos criam somente clientes.

## Funcionalidades

- Login por e-mail ou telefone, cadastro, sessão persistente, perfil e recuperação de senha.
- Cliente: próximos horários e histórico, agendamento em quatro passos, cancelamento e remarcação.
- Barbeiro: agenda diária/semanal, confirmação/conclusão de atendimentos e bloqueio de horários.
- Administração: indicadores derivados do banco, gestão de clientes, barbeiros, serviços e agendamentos; busca, filtros e ordenação.
- Preços e durações validados no servidor; horários em `America/Sao_Paulo`; autorização por perfil e propriedade da reserva; transações para evitar sobreposição.

## Estrutura

```text
client/src/components/   Componentes e navegação compartilhados
client/src/features/     Telas por fluxo: auth, customer e staff
client/src/lib/          API, autenticação, formatação e tipos
client/public/assets/    SVGs originais do Figma
server/src/              API, banco, regras de agendamento e segurança
server/                  Migrações, dados iniciais e testes
compose.yaml             PostgreSQL local persistente
```

## Verificação e build

```sh
npm test
npm run build
```

O build gera o frontend em `client/dist` e o backend em `server/dist`. `npm start` inicia a API e serve o frontend compilado na mesma origem.

## Limites desta versão

O sistema não cobra pagamentos nem envia lembretes. A seção Clube Navalha calcula visitas concluídas; não resgata prêmios. Os números e datas das telas vêm do banco, portanto diferem dos exemplos estáticos do Figma. As etapas e modais necessários para completar os fluxos seguem o mesmo sistema visual. A tipografia usa Arial e Georgia disponíveis no sistema; as métricas podem variar em relação à fonte Georgia Black da referência.

Na recuperação de senha em desenvolvimento, o link válido aparece na tela e no terminal da API. O envio de e-mail não está implementado; em produção essa função informa que a barbearia precisa ser contatada. Para produção, use HTTPS, credenciais próprias de banco, `NODE_ENV=production`, e deixe a carga inicial de demonstração desativada. Crie a primeira conta administrativa com `ADMIN_EMAIL`, `ADMIN_NAME` e `ADMIN_PASSWORD` (mínimo 12 caracteres com letra e número) e execute `npm run db:admin -w server`. Configure `APP_ORIGIN` com a URL pública real do site.

Referências: [design no Figma](https://www.figma.com/design/Hr2YUttM7pzssCukvJKs6Y?node-id=41-2), [React](https://react.dev/), [segurança Express](https://expressjs.com/en/advanced/best-practice-security/), [transações PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html).
