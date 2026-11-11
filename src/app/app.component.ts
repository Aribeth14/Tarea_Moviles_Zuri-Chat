import { Component, effect, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { AuthService } from './services/auth.service';
import { PresenceService } from './services/presence.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  private auth = inject(AuthService);
  private presence = inject(PresenceService);

  constructor() {
    // Con sesión: aparezco "en línea"
    effect(() => {
      if (this.auth.user()) this.presence.start();
      else this.presence.stop();
    });
  }
}
