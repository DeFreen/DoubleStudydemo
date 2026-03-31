# Double Lab Demo

Projeto educacional inspirado em interfaces de double, com landing, login fake, perfis locais e mesa demo em tempo real.

## Stack

- React + Vite no frontend
- Node + Express no backend
- WebSocket para atualizacao em tempo real
- LocalStorage para perfis, saldo e ultimas apostas
- Web Audio API para efeitos sonoros

## Desenvolvimento

1. `npm install`
2. `npm run dev:server`
3. `npm run dev:client`

Frontend em `http://localhost:5173` e API/socket servidos pelo backend em `http://localhost:3001`.

## Fluxo de producao local

1. `npm run build`
2. `npm run start`

Depois do build, o Express passa a servir o `dist` do frontend junto com a API e o WebSocket.

## Colocar online com Render

1. Suba este projeto para um repositorio no GitHub
2. No Render, crie um novo `Web Service` a partir do repositorio
3. Se preferir, use o arquivo `render.yaml` da raiz para importar a configuracao automaticamente
4. O build e `npm install && npm run build`
5. O start e `npm run start`

Depois do deploy, o app abre em uma URL publica `.onrender.com`.

## Perfis locais

- Voce pode criar varios perfis demo no login
- Cada perfil guarda saldo e historico localmente no navegador
- O logout nao apaga os perfis salvos

## Aviso

Tudo aqui e apenas demo para estudo. Sem dinheiro real, sem deposito, sem saque e sem integracao financeira.
