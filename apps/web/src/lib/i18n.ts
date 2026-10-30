import { useStore } from './store';

/**
 * Interface language. Strings are written in Portuguese (the community's default)
 * and translated by lookup; anything without an English entry stays in Portuguese.
 */
const en: Record<string, string> = {
  'Mensagens diretas': 'Direct messages',
  Amigos: 'Friends',
  Configurações: 'Settings',
  'Painel administrativo': 'Admin panel',
  Sair: 'Log out',
  Membros: 'Members',
  'Membros online': 'Online members',
  Offline: 'Offline',
  'Bots ativos': 'Active bots',
  'Próximos eventos': 'Upcoming events',
  'Atividade recente': 'Recent activity',
  Buscar: 'Search',
  Notificações: 'Notifications',
  'Enviar mensagem em': 'Message',
  Responder: 'Reply',
  Editar: 'Edit',
  Excluir: 'Delete',
  Fixar: 'Pin',
  Desafixar: 'Unpin',
  'Criar thread': 'Start thread',
  Denunciar: 'Report',
  'Copiar texto': 'Copy text',
  Favoritar: 'Save',
  'Entrar na chamada': 'Join call',
  'Sair da chamada': 'Leave call',
  'Compartilhar tela': 'Share screen',
  'Parar compartilhamento': 'Stop sharing',
  Câmera: 'Camera',
  Microfone: 'Microphone',
  Silenciar: 'Mute',
  'Ensurdecer': 'Deafen',
  Perfil: 'Profile',
  Aparência: 'Appearance',
  Sons: 'Sounds',
  Privacidade: 'Privacy',
  'Voz e vídeo': 'Voice & video',
  Segurança: 'Security',
  Idioma: 'Language',
  Salvar: 'Save',
  'Salvar alterações': 'Save changes',
  Cancelar: 'Cancel',
  Início: 'Home',
  Eventos: 'Events',
  Notas: 'Notes',
  Favoritos: 'Saved',
  Novidades: "What's new",
  'Discussões populares': 'Popular discussions',
  'Status do servidor': 'Server status',
  'Histórico de atividades': 'Activity history',
  'Disponível': 'Online',
  Ausente: 'Idle',
  'Não perturbe': 'Do not disturb',
  Invisível: 'Invisible',
  'Novo tópico': 'New topic',
  Arquivos: 'Files',
  'Enviar arquivo': 'Upload file',
  'Nova pasta': 'New folder',
  'Atalhos de teclado': 'Keyboard shortcuts',
};

export function t(pt: string) {
  return useStore.getState().me?.preferences.locale === 'en' ? en[pt] ?? pt : pt;
}
export function useT() {
  const locale = useStore((s) => s.me?.preferences.locale);
  return (pt: string) => (locale === 'en' ? en[pt] ?? pt : pt);
}
