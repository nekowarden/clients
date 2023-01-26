import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";

import { CipherType } from "@bitwarden/common/enums/cipherType";

export type AddButtonState = {
  enabled: boolean;
};

export type AddButtonAction = {
  isSend: boolean;
  isCipher: boolean;
  typeCipher?: CipherType;
};

@Injectable()
export class AddButtonService {
  private _state = {
    enabled: false,
  };

  private _action = {
    isSend: false,
    isCipher: false,
  };

  private stateSubject = new BehaviorSubject<AddButtonState>(this._state);
  state$ = this.stateSubject.asObservable();

  private emittedSubject = new BehaviorSubject<AddButtonAction>(this._action);
  emitted$ = this.emittedSubject.asObservable();

  setEnabled(enabled: boolean) {
    this._state.enabled = enabled;
    this.stateSubject.next(this._state);
  }

  emit(e: AddButtonAction) {
    this.emittedSubject.next(e);
  }
}
