import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Solo deja pasar si hay sesión
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router); // se pide ANTES del await
  await auth.ready;
  return auth.user() ? true : router.createUrlTree(['/login']);
};

// Para login/registro: si ya estás dentro, te manda al home
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  return auth.user() ? router.createUrlTree(['/home']) : true;
};
