import { Injectable } from '@angular/core';
import { initializeApp } from 'firebase/app';
import { Auth, getAuth, signInAnonymously } from 'firebase/auth';
import { Firestore, initializeFirestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class FirebaseService {
  private app = initializeApp(environment.firebase);
  private auth: Auth = getAuth(this.app);

  // Firestore, con detección automática de conexiones lentas
  readonly db: Firestore = initializeFirestore(this.app, { experimentalAutoDetectLongPolling: true });

  private session?: Promise<boolean>;

  // Entra a Firebase de forma anónima y avisa si funcionó
  ready(): Promise<boolean> {
    this.session ??= signInAnonymously(this.auth).then(
      () => true,
      e => {
        console.warn('Firebase no disponible:', e);
        this.session = undefined; // permite reintentar más tarde
        return false;
      }
    );
    return this.session;
  }
}
