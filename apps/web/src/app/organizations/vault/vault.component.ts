import {
  ChangeDetectorRef,
  Component,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
  ViewContainerRef,
} from "@angular/core";
import { ActivatedRoute, Params, Router } from "@angular/router";
import { combineLatest, firstValueFrom, Subject } from "rxjs";
import { first, switchMap, takeUntil } from "rxjs/operators";

import { ModalService } from "@bitwarden/angular/services/modal.service";
import { BroadcasterService } from "@bitwarden/common/abstractions/broadcaster.service";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { MessagingService } from "@bitwarden/common/abstractions/messaging.service";
import { OrganizationService } from "@bitwarden/common/abstractions/organization/organization.service.abstraction";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { Organization } from "@bitwarden/common/models/domain/organization";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { PasswordRepromptService } from "@bitwarden/common/vault/abstractions/password-reprompt.service";
import { SyncService } from "@bitwarden/common/vault/abstractions/sync/sync.service.abstraction";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { DialogService } from "@bitwarden/components";

import { VaultFilterService } from "../../../vault/app/vault/vault-filter/services/abstractions/vault-filter.service";
import { VaultFilter } from "../../../vault/app/vault/vault-filter/shared/models/vault-filter.model";
import { EntityEventsComponent } from "../manage/entity-events.component";

import { AddEditComponent } from "./add-edit.component";
import { AttachmentsComponent } from "./attachments.component";
import { CollectionsComponent } from "./collections.component";
import { VaultFilterComponent } from "./vault-filter/vault-filter.component";
import { VaultItemsComponent } from "./vault-items.component";

const BroadcasterSubscriptionId = "OrgVaultComponent";

@Component({
  selector: "app-org-vault",
  templateUrl: "vault.component.html",
})
export class VaultComponent implements OnInit, OnDestroy {
  @ViewChild("vaultFilter", { static: true })
  vaultFilterComponent: VaultFilterComponent;
  @ViewChild(VaultItemsComponent, { static: true }) vaultItemsComponent: VaultItemsComponent;
  @ViewChild("attachments", { read: ViewContainerRef, static: true })
  attachmentsModalRef: ViewContainerRef;
  @ViewChild("cipherAddEdit", { read: ViewContainerRef, static: true })
  cipherAddEditModalRef: ViewContainerRef;
  @ViewChild("collections", { read: ViewContainerRef, static: true })
  collectionsModalRef: ViewContainerRef;
  @ViewChild("eventsTemplate", { read: ViewContainerRef, static: true })
  eventsModalRef: ViewContainerRef;

  organization: Organization;
  trashCleanupWarning: string = null;
  activeFilter: VaultFilter = new VaultFilter();
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private organizationService: OrganizationService,
    protected vaultFilterService: VaultFilterService,
    private router: Router,
    private changeDetectorRef: ChangeDetectorRef,
    private syncService: SyncService,
    private i18nService: I18nService,
    private modalService: ModalService,
    private dialogService: DialogService,
    private messagingService: MessagingService,
    private broadcasterService: BroadcasterService,
    private ngZone: NgZone,
    private platformUtilsService: PlatformUtilsService,
    private cipherService: CipherService,
    private passwordRepromptService: PasswordRepromptService
  ) {}

  async ngOnInit() {
    this.trashCleanupWarning = this.i18nService.t(
      this.platformUtilsService.isSelfHost()
        ? "trashCleanupWarningSelfHosted"
        : "trashCleanupWarning"
    );

    this.route.parent.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.organization = this.organizationService.get(params.organizationId);
    });

    this.route.queryParams.pipe(first(), takeUntil(this.destroy$)).subscribe((qParams) => {
      this.vaultItemsComponent.searchText = this.vaultFilterComponent.searchText = qParams.search;
    });

    // verifies that the organization has been set
    combineLatest([this.route.queryParams, this.route.parent.params])
      .pipe(
        switchMap(async ([qParams]) => {
          const cipherId = getCipherIdFromParams(qParams);
          if (!cipherId) {
            return;
          }
          if (
            // Handle users with implicit collection access since they use the admin endpoint
            this.organization.canUseAdminCollections ||
            (await this.cipherService.get(cipherId)) != null
          ) {
            this.editCipherId(cipherId);
          } else {
            this.platformUtilsService.showToast(
              "error",
              this.i18nService.t("errorOccurred"),
              this.i18nService.t("unknownCipher")
            );
            this.router.navigate([], {
              queryParams: { cipherId: null, itemId: null },
              queryParamsHandling: "merge",
            });
          }
        }),
        takeUntil(this.destroy$)
      )
      .subscribe();

    if (!this.organization.canUseAdminCollections) {
      this.broadcasterService.subscribe(BroadcasterSubscriptionId, (message: any) => {
        this.ngZone.run(async () => {
          switch (message.command) {
            case "syncCompleted":
              if (message.successfully) {
                await Promise.all([
                  this.vaultFilterService.reloadCollections(),
                  this.vaultItemsComponent.refresh(),
                ]);
                this.changeDetectorRef.detectChanges();
              }
              break;
          }
        });
      });
      await this.syncService.fullSync(false);
    }
  }

  ngOnDestroy() {
    this.broadcasterService.unsubscribe(BroadcasterSubscriptionId);
    this.destroy$.next();
    this.destroy$.complete();
  }

  async applyVaultFilter(filter: VaultFilter) {
    this.activeFilter = filter;
    this.vaultItemsComponent.showAddNew = !this.activeFilter.isDeleted;
    await this.vaultItemsComponent.reload(
      this.activeFilter.buildFilter(),
      this.activeFilter.isDeleted
    );
    this.go();
  }

  async refreshItems() {
    this.vaultItemsComponent.actionPromise = this.vaultItemsComponent.refresh();
    await this.vaultItemsComponent.actionPromise;
    this.vaultItemsComponent.actionPromise = null;
  }

  filterSearchText(searchText: string) {
    this.vaultItemsComponent.searchText = searchText;
    this.vaultItemsComponent.search(200);
  }

  async editCipherAttachments(cipher: CipherView) {
    if (this.organization.maxStorageGb == null || this.organization.maxStorageGb === 0) {
      this.messagingService.send("upgradeOrganization", { organizationId: cipher.organizationId });
      return;
    }

    let madeAttachmentChanges = false;

    const [modal] = await this.modalService.openViewRef(
      AttachmentsComponent,
      this.attachmentsModalRef,
      (comp) => {
        comp.organization = this.organization;
        comp.cipherId = cipher.id;
        // eslint-disable-next-line rxjs-angular/prefer-takeuntil
        comp.onUploadedAttachment.subscribe(() => (madeAttachmentChanges = true));
        // eslint-disable-next-line rxjs-angular/prefer-takeuntil
        comp.onDeletedAttachment.subscribe(() => (madeAttachmentChanges = true));
      }
    );

    // eslint-disable-next-line rxjs-angular/prefer-takeuntil, rxjs/no-async-subscribe
    modal.onClosed.subscribe(async () => {
      if (madeAttachmentChanges) {
        await this.vaultItemsComponent.refresh();
      }
      madeAttachmentChanges = false;
    });
  }

  async editCipherCollections(cipher: CipherView) {
    const currCollections = await firstValueFrom(this.vaultFilterService.filteredCollections$);
    const [modal] = await this.modalService.openViewRef(
      CollectionsComponent,
      this.collectionsModalRef,
      (comp) => {
        comp.collectionIds = cipher.collectionIds;
        comp.collections = currCollections.filter((c) => !c.readOnly && c.id != null);
        comp.organization = this.organization;
        comp.cipherId = cipher.id;
        // eslint-disable-next-line rxjs-angular/prefer-takeuntil, rxjs/no-async-subscribe
        comp.onSavedCollections.subscribe(async () => {
          modal.close();
          await this.vaultItemsComponent.refresh();
        });
      }
    );
  }

  async addCipher() {
    const component = await this.editCipher(null);
    component.organizationId = this.organization.id;
    component.type = this.activeFilter.cipherType;
    component.collections = (
      await firstValueFrom(this.vaultFilterService.filteredCollections$)
    ).filter((c) => !c.readOnly && c.id != null);
    if (this.activeFilter.collectionId) {
      component.collectionIds = [this.activeFilter.collectionId];
    }
  }

  async navigateToCipher(cipher: CipherView) {
    this.go({ itemId: cipher?.id });
  }

  async editCipher(cipher: CipherView) {
    return this.editCipherId(cipher?.id);
  }

  async editCipherId(cipherId: string) {
    const cipher = await this.cipherService.get(cipherId);
    if (cipher != null && cipher.reprompt != 0) {
      if (!(await this.passwordRepromptService.showPasswordPrompt())) {
        this.go({ cipherId: null, itemId: null });
        return;
      }
    }

    const [modal, childComponent] = await this.modalService.openViewRef(
      AddEditComponent,
      this.cipherAddEditModalRef,
      (comp) => {
        comp.organization = this.organization;
        comp.cipherId = cipherId;
        // eslint-disable-next-line rxjs-angular/prefer-takeuntil, rxjs/no-async-subscribe
        comp.onSavedCipher.subscribe(async () => {
          modal.close();
          await this.vaultItemsComponent.refresh();
        });
        // eslint-disable-next-line rxjs-angular/prefer-takeuntil, rxjs/no-async-subscribe
        comp.onDeletedCipher.subscribe(async () => {
          modal.close();
          await this.vaultItemsComponent.refresh();
        });
        // eslint-disable-next-line rxjs-angular/prefer-takeuntil, rxjs/no-async-subscribe
        comp.onRestoredCipher.subscribe(async () => {
          modal.close();
          await this.vaultItemsComponent.refresh();
        });
      }
    );

    modal.onClosedPromise().then(() => {
      this.go({ cipherId: null, itemId: null });
    });

    return childComponent;
  }

  async cloneCipher(cipher: CipherView) {
    const component = await this.editCipher(cipher);
    component.cloneMode = true;
    component.organizationId = this.organization.id;
    component.collections = (
      await firstValueFrom(this.vaultFilterService.filteredCollections$)
    ).filter((c) => !c.readOnly && c.id != null);
    component.collectionIds = cipher.collectionIds;
  }

  async viewEvents(cipher: CipherView) {
    await this.modalService.openViewRef(EntityEventsComponent, this.eventsModalRef, (comp) => {
      comp.name = cipher.name;
      comp.organizationId = this.organization.id;
      comp.entityId = cipher.id;
      comp.showUser = true;
      comp.entity = "cipher";
    });
  }

  private go(queryParams: any = null) {
    if (queryParams == null) {
      queryParams = {
        type: this.activeFilter.cipherType,
        collectionId: this.activeFilter.collectionId,
        deleted: this.activeFilter.isDeleted || null,
      };
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }
}

/**
 * Allows backwards compatibility with
 * old links that used the original `cipherId` param
 */
const getCipherIdFromParams = (params: Params): string => {
  return params["itemId"] || params["cipherId"];
};
