import { Component, input, output, viewChild } from '@angular/core';
import { IonButton, IonIcon, IonModal } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { locateOutline, phonePortraitOutline, stopCircleOutline } from 'ionicons/icons';

/**
 * The "Turn on your location" bottom sheet shown when the app opens.
 * The parent decides when it's open; this component only reports the user's choice.
 */
@Component({
  selector: 'app-location-prompt',
  templateUrl: 'location-prompt.component.html',
  styleUrls: ['location-prompt.component.scss'],
  imports: [IonButton, IonIcon, IonModal],
})
export class LocationPromptComponent {
  readonly isOpen = input(false);
  /** The user tapped "Turn on location". */
  readonly accepted = output<void>();
  /** The user tapped "Not now", swiped the sheet down, or tapped outside it. */
  readonly declined = output<void>();

  private readonly modal = viewChild(IonModal);
  private choseTurnOn = false;

  constructor() {
    addIcons({ locateOutline, phonePortraitOutline, stopCircleOutline });
  }

  /** Both buttons close the sheet the same way; the choice is reported once it has closed. */
  protected choose(turnOn: boolean): void {
    this.choseTurnOn = turnOn;
    void this.modal()?.dismiss();
  }

  /** Runs however the sheet was closed (button, swipe down, tap outside). */
  protected onDidDismiss(): void {
    if (this.choseTurnOn) {
      this.accepted.emit();
    } else {
      this.declined.emit();
    }
    this.choseTurnOn = false;
  }
}
