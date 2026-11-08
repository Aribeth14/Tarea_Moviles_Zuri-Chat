import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-home', standalone: true, imports: [IonContent],
  templateUrl: './home.page.html',
})
export class HomePage {
  auth = inject(AuthService);
  private router = inject(Router);
  async salir() { await this.auth.logout(); this.router.navigateByUrl('/login', { replaceUrl: true }); }
}
