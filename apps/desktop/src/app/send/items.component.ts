import { Component, EventEmitter, Input, NgZone, OnDestroy, OnInit, Output } from "@angular/core";

import { SendComponent as BaseSendComponent } from "@bitwarden/angular/components/send/send.component";
import { BroadcasterService } from "@bitwarden/common/abstractions/broadcaster.service";
import { EnvironmentService } from "@bitwarden/common/abstractions/environment.service";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { PolicyService } from "@bitwarden/common/abstractions/policy/policy.service.abstraction";
import { SearchService } from "@bitwarden/common/abstractions/search.service";
import { SendService } from "@bitwarden/common/abstractions/send.service";
import { SendView } from "@bitwarden/common/models/view/send.view";

import { invokeMenu, RendererMenuItem } from "../../utils";
import { SearchBarService } from "../layout/search/search-bar.service";

const BroadcasterSubscriptionId = "SendItemsComponent";

@Component({
  selector: "app-send-items",
  templateUrl: "items.component.html",
})
export class SendItemsComponent extends BaseSendComponent implements OnInit, OnDestroy {
  @Input() sendId: string;

  @Output() onAddSend = new EventEmitter();
  @Output() onSelectSend = new EventEmitter<string>();
  @Output() onDeletedSend = new EventEmitter<SendView>();

  constructor(
    sendService: SendService,
    i18nService: I18nService,
    platformUtilsService: PlatformUtilsService,
    environmentService: EnvironmentService,
    private broadcasterService: BroadcasterService,
    ngZone: NgZone,
    searchService: SearchService,
    policyService: PolicyService,
    private searchBarService: SearchBarService,
    logService: LogService
  ) {
    super(
      sendService,
      i18nService,
      platformUtilsService,
      environmentService,
      ngZone,
      searchService,
      policyService,
      logService
    );
    // eslint-disable-next-line rxjs-angular/prefer-takeuntil
    this.searchBarService.searchText$.subscribe((searchText) => {
      this.searchText = searchText;
      this.searchTextChanged();
    });
  }

  async ngOnInit() {
    this.searchBarService.setEnabled(true);
    this.searchBarService.setPlaceholderText(this.i18nService.t("searchSends"));

    super.ngOnInit();
    this.broadcasterService.subscribe(BroadcasterSubscriptionId, (message: any) => {
      this.ngZone.run(async () => {
        switch (message.command) {
          case "syncCompleted":
            await this.load();
            break;
        }
      });
    });
    await this.load();
  }

  ngOnDestroy() {
    this.broadcasterService.unsubscribe(BroadcasterSubscriptionId);
    this.searchBarService.setEnabled(false);
  }

  viewSendMenu(send: SendView) {
    const menu: RendererMenuItem[] = [];
    menu.push({
      label: this.i18nService.t("copyLink"),
      click: () => this.copy(send),
    });
    if (send.password && !send.disabled) {
      menu.push({
        label: this.i18nService.t("removePassword"),
        click: async () => {
          await this.removePassword(send);
          if (this.sendId === send.id) {
            this.sendId = null;
            this.onSelectSend.emit(send.id);
          }
        },
      });
    }
    menu.push({
      label: this.i18nService.t("delete"),
      click: async () => {
        await this.delete(send);
        await this.onDeletedSend.emit(send);
      },
    });

    invokeMenu(menu);
  }

  async selectSend(sendId: string) {
    await this.onSelectSend.emit(sendId);
  }

  addSend() {
    this.onAddSend.emit();
  }
}
