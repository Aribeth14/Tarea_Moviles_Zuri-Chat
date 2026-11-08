import {inject} from '@angular/core';
import { CanActivateFn, CanDeactivateFn,Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

//Solo permite el acceso si hay sesión
export const authGuard: CanActivateFn=async() => {
    const auth=inject(AuthService);
    await auth.ready;  //Espera a saber que hay una sesion guardada
    return auth.user()? true: inject(Router).createUrlTree(['/login']);
};

//Para login/registro: si el usuario ya esta dentro - Home
export const guestGuard: CanActivateFn=async() => {
    const auth = inject(AuthService);
    await auth.ready;
    return auth.user() ? inject(Router).createUrlTree(['/home']) : true;

};

