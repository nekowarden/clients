import { Component, OnDestroy, OnInit } from "@angular/core";
import { Subject, takeUntil } from "rxjs";

import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { CipherType } from "@bitwarden/common/vault/enums/cipher-type";

import { invokeMenu, RendererMenuItem } from "../../utils";

import { AddButtonService, AddButtonState } from "./add-button.service";

@Component({
  selector: "add-button",
  templateUrl: "add-button.component.html",
})
export class AddButtonComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  state: AddButtonState;

  constructor(private addButtonService: AddButtonService, private i18nService: I18nService) {}

  async ngOnInit(): Promise<void> {
    this.addButtonService.state$.pipe(takeUntil(this.destroy$)).subscribe((state) => {
      this.state = state;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  addItemOptions() {
    const menu: RendererMenuItem[] = [
      {
        label: this.i18nService.t("typeLogin"),
        click: () => this.addCipher(CipherType.Login),
      },
      {
        label: this.i18nService.t("typeCard"),
        click: () => this.addCipher(CipherType.Card),
      },
      {
        label: this.i18nService.t("typeIdentity"),
        click: () => this.addCipher(CipherType.Identity),
      },
      {
        label: this.i18nService.t("typeSecureNote"),
        click: () => this.addCipher(CipherType.SecureNote),
      },
      {
        type: "separator",
      },
      {
        label: "Send",
        click: () => this.addSend(),
      },
    ];

    invokeMenu(menu);
  }

  addCipher(c: CipherType = CipherType.Login) {
    this.addButtonService.emit({ isSend: false, isCipher: true, typeCipher: c });
  }

  addSend() {
    this.addButtonService.emit({ isSend: true, isCipher: false });
  }
}
