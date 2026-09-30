import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'welcome',
    loadComponent: () => import('./pages/welcome/welcome.page').then((m) => m.WelcomePage),
  },
  {
    path: 'home',
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage),
  },
  {
    path: 'locations',
    loadComponent: () => import('./pages/locations/locations.page').then((m) => m.LocationsPage),
  },
  {
    // Must come BEFORE 'locations/:id', otherwise "new" would be read as an id.
    path: 'locations/new',
    loadComponent: () => import('./pages/location-form/location-form.page').then((m) => m.LocationFormPage),
  },
  {
    path: 'locations/:id',
    loadComponent: () =>
      import('./pages/location-detail/location-detail.page').then((m) => m.LocationDetailPage),
  },
  {
    path: 'locations/:id/edit',
    loadComponent: () => import('./pages/location-form/location-form.page').then((m) => m.LocationFormPage),
  },
  {
    // Every app start shows the Get Started screen first.
    path: '',
    redirectTo: 'welcome',
    pathMatch: 'full',
  },
];
