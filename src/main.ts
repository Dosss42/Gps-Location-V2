import { inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { LocationDetectionService } from './app/core/services/location-detection.service';
import { LocationStore } from './app/core/services/location-store.service';
import { SpeechService } from './app/core/services/speech.service';
import { ThemeService } from './app/core/services/theme.service';

bootstrapApplication(AppComponent, {
  providers: [
    // Before the first screen: open the database, load saved places, voice settings and theme.
    // Every loader catches its own errors, so a storage problem never stops the app from starting.
    provideAppInitializer(() => {
      const locations = inject(LocationStore);
      const speech = inject(SpeechService);
      const theme = inject(ThemeService);
      // Creating the detection service here starts automatic detection for the whole app.
      const detection = inject(LocationDetectionService);
      return Promise.all([locations.load(), speech.loadSettings(), theme.load(), detection.load()]);
    }),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
  ],
});
