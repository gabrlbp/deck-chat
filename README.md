# Deck Chat

App desktop (Windows) para o PokeIdle: até 4 contas lado a lado, cada uma com sessão própria, e a conta principal presente nos chats dos streamers oficiais da Twitch para o bônus, sem vídeo e sem tela de chat.

- **Contas**: grid automático com as alts; cada slot é um navegador separado (login salvo). Recarrega sozinho se o jogo parar de responder.
- **Notificações**: shinies, drops, capturas e problemas de todas as alts numa linha do tempo.
- **Twitch**: lista oficial de streamers vinda do próprio jogo, bônus estimado por canal.
- **Bandeja**: fechar ou minimizar esconde o app; pode iniciar com o Windows.
- **Atualização automática** pelos Releases deste repositório (app instalado).

Documentação: [PRD](docs/PRD.md) · [Decisões técnicas](docs/TECHNICAL.md)

## Desenvolvimento

```bash
npm install
npm run dev
npm run typecheck && npm test
```

## Release

Subir `version` no `package.json`, commitar e criar a tag correspondente:

```bash
git tag v0.1.0
git push origin master v0.1.0
```

O GitHub Actions gera o instalador e o zip portátil no Release da tag. O app instalado se atualiza sozinho; o zip portátil se atualiza baixando o novo.

## Créditos e licença

- Projeto independente, sem ligação com o PokeIdle, a Twitch ou a Kick.

Licença [MIT](LICENSE).
