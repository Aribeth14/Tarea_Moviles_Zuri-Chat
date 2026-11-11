import { Injectable, inject } from '@angular/core';
import {
  Timestamp, Unsubscribe, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where,
} from 'firebase/firestore';
import { AuthService } from './auth.service';
import { FirebaseService } from './firebase.service';

@Injectable({ providedIn: 'root' })
export class PresenceService {
  private fb = inject(FirebaseService);
  private auth = inject(AuthService);

  private uid = '';
  private running = false;
  private timer?: ReturnType<typeof setInterval>;

  // Mi estado "en línea" 
  async start() {
    const id = this.auth.user()?.id;
    if (!id || this.running) return;
    this.running = true;
    this.uid = id;

    if (!(await this.fb.ready()) || !this.running) { this.running = false; return; }

    this.beat(true);
    
    this.timer = setInterval(() => {
      if (document.visibilityState === 'visible') this.beat(true);
    }, 25000);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onHide);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onHide);
    this.beat(false);
  }

  private onVisibility = () => this.beat(document.visibilityState === 'visible');
  private onHide = () => this.beat(false);

  private beat(online: boolean) {
    if (!this.uid) return;
    setDoc(doc(this.fb.db, 'presence', this.uid), { online, lastSeen: serverTimestamp() }).catch(() => {});
  }

  // Observa si otra persona está en línea
  watchPresence(userId: string, cb: (online: boolean) => void): () => void {
    let data: { online: boolean; lastSeen: number } | null = null;
    let last: boolean | null = null;
    let un: Unsubscribe | undefined;
    let cancelled = false;

    // En línea = lo marcó así Y su último latido fue hace menos de 70 s
    const emit = () => {
      const on = !!data && data.online && Date.now() - data.lastSeen < 70000;
      if (on !== last) { last = on; cb(on); }
    };
    const tick = setInterval(emit, 15000);

    this.fb.ready().then(ok => {
      if (!ok || cancelled) return;
      un = onSnapshot(
        doc(this.fb.db, 'presence', userId),
        snap => {
          const d = snap.data({ serverTimestamps: 'estimate' });
          data = d
            ? { online: !!d['online'], lastSeen: (d['lastSeen'] as Timestamp | null)?.toMillis() ?? Date.now() }
            : null;
          emit();
        },
        e => console.warn('presence:', e)
      );
    });

    return () => { cancelled = true; clearInterval(tick); un?.(); };
  }

  // "Escribiendo…"
  async setTyping(roomId: string) {
    if (!this.uid || !(await this.fb.ready())) return;
    setDoc(doc(this.fb.db, 'typing', `${roomId}__${this.uid}`), {
      roomId, userId: this.uid, at: serverTimestamp(),
    }).catch(() => {});
  }

  async clearTyping(roomId: string) {
    if (!this.uid || !(await this.fb.ready())) return;
    deleteDoc(doc(this.fb.db, 'typing', `${roomId}__${this.uid}`)).catch(() => {});
  }

  // Observa quién escribe en una sala (sin contarme a mí)
  watchTyping(roomId: string, myId: string, cb: (userIds: string[]) => void): () => void {
    const seen = new Map<string, number>();
    let last = '';
    let un: Unsubscribe | undefined;
    let cancelled = false;

    // Si alguien lleva más de 6 s sin dar señal, deja de contar como "escribiendo"
    const emit = () => {
      const now = Date.now();
      const ids = [...seen].filter(([id, t]) => id !== myId && now - t < 6000).map(([id]) => id);
      const key = ids.join(',');
      if (key !== last) { last = key; cb(ids); }
    };
    const tick = setInterval(emit, 2000);

    this.fb.ready().then(ok => {
      if (!ok || cancelled) return;
      un = onSnapshot(
        query(collection(this.fb.db, 'typing'), where('roomId', '==', roomId)),
        snap => {
          snap.docChanges().forEach(ch => {
            const userId = ch.doc.data()['userId'] as string;
            if (ch.type === 'removed') seen.delete(userId);
            else seen.set(userId, Date.now());
          });
          emit();
        },
        e => console.warn('typing:', e)
      );
    });

    return () => { cancelled = true; clearInterval(tick); un?.(); };
  }
}
