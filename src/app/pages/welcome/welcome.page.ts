import { Component, inject } from '@angular/core';
import { IonButton, IonContent, IonIcon, NavController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { lockClosedOutline, navigateOutline, volumeHighOutline } from 'ionicons/icons';

import { OnboardingService } from '../../core/services/onboarding.service';

/** First-launch screen: explains the app and prepares the user for the permission dialog. */
@Component({
  selector: 'app-welcome',
  templateUrl: 'welcome.page.html',
  styleUrls: ['welcome.page.scss'],
  imports: [IonButton, IonContent, IonIcon],
})
export class WelcomePage {
  private readonly onboarding = inject(OnboardingService);
  private readonly navController = inject(NavController);

  constructor() {
    addIcons({ lockClosedOutline, navigateOutline, volumeHighOutline });
  }

  protected async getStarted(): Promise<void> {
    this.onboarding.complete();
    // navigateRoot clears the history, so the back button can't return to this screen.
    // The home page then starts GPS, which shows Android's permission dialog.
    await this.navController.navigateRoot('/home');
  }
}
