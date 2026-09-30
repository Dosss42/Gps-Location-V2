import { Component, inject } from '@angular/core';
import { IonButton, IonContent, IonIcon, NavController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { lockClosedOutline, navigateOutline, volumeHighOutline } from 'ionicons/icons';

/** Start screen, shown every time the app opens: explains the app before anything else happens. */
@Component({
  selector: 'app-welcome',
  templateUrl: 'welcome.page.html',
  styleUrls: ['welcome.page.scss'],
  imports: [IonButton, IonContent, IonIcon],
})
export class WelcomePage {
  private readonly navController = inject(NavController);

  constructor() {
    addIcons({ lockClosedOutline, navigateOutline, volumeHighOutline });
  }

  protected async getStarted(): Promise<void> {
    // navigateRoot clears the history, so the back button can't return to this screen.
    await this.navController.navigateRoot('/home');
  }
}
