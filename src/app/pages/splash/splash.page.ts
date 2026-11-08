import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';
import { ZuriLogoComponent } from '../../components/zuri-logo/zuri-logo.component';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.page.html',
  styleUrls: ['./splash.page.scss'],
  imports: [IonContent, ZuriLogoComponent],
})
export class SplashPage implements OnInit {
  private router = inject(Router);
  private auth = inject(AuthService);

  async ngOnInit() {
    // Espera mínimo 2.4 s (para ver la animación) y a saber si hay sesión guardada
    await Promise.all([this.auth.ready, new Promise(r => setTimeout(r, 2400))]);
    this.router.navigateByUrl(this.auth.user() ? '/home' : '/login', { replaceUrl: true });
  }
}
