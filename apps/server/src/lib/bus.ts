import { EventEmitter } from 'node:events';

/** Domain events consumed by bots, notifications and statistics. */
export interface BusEvents {
  'member.approved': { userId: string };
  'member.left': { userId: string };
  'message.created': { message: any; channel: any };
  'message.deleted': { messageId: string; channelId: string };
  'event.created': { event: any };
  'event.starting': { event: any; minutes: number };
  'voice.joined': { channelId: string; userId: string };
  'voice.left': { channelId: string; userId: string };
  'announcement.created': { title: string; body: string };
}

export class EventBus {
  private ee = new EventEmitter();
  constructor() {
    this.ee.setMaxListeners(100);
  }
  on<K extends keyof BusEvents>(event: K, fn: (payload: BusEvents[K]) => void | Promise<void>) {
    this.ee.on(event, (p) => {
      Promise.resolve()
        .then(() => fn(p))
        .catch((err) => this.ee.emit('error', err));
    });
  }
  emit<K extends keyof BusEvents>(event: K, payload: BusEvents[K]) {
    this.ee.emit(event, payload);
  }
  onError(fn: (err: unknown) => void) {
    this.ee.on('error', fn);
  }
}
