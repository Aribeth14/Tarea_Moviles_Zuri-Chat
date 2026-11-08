import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';
import { ZuriLogoComponent } from '../../components/zuri-logo/zuri-logo.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [IonContent, ReactiveFormsModule, RouterLink, ZuriLogoComponent],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  // Formulario con validaciones
  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  showPass = signal(false);   // mostrar/ocultar contraseña
  loading = signal(false);    // estado del botón
  error = signal('');         // mensaje de error

  async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched(); // fuerza a mostrar los errores
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.login(email, password);
      this.router.navigateByUrl('/home', { replaceUrl: true });
    } catch (e: any) {
      // Traducimos el error técnico a un mensaje comprensible
      this.error.set(
        e.message?.includes('Invalid login')
          ? 'Correo o contraseña incorrectos. Inténtalo de nuevo.'
          : 'Algo salió mal. Revisa tu conexión.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  // Atajo para saber si un campo debe mostrarse en rojo
  invalid(name: 'email' | 'password') {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }
}

