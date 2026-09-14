# ScreenRoom (Lobby Edition)

Sistema privado de compartilhamento de tela com controle e aprovação do host em tempo real.

## Modificações Recentes
- **Sem Links Manuais**: A tela inicial agora exibe a lista pública de salas em tempo real.
- **Painel de Aprovação**: Os espectadores agora precisam pedir entrada e serem autorizados para assistir à tela do Host.
- **Grace Period (F5 Resiliente)**: Se o Host atualizar a tela (F5), ele mantém a propriedade da sala graças à `hostKey` salva localmente no navegador.
