import { get, type Writable } from "svelte/store";

export function waitForChange<T>(writable: Writable<T>): Promise<T> {
    let unsubscribe:()=>{};
  const promise = new Promise((resolve,reject) => {
    let receivedInitial = false;
    let previousValue : any;
    unsubscribe = writable.subscribe(value => {
      if (!receivedInitial) {
        receivedInitial = true;
        previousValue = value;
      } else if (value !== previousValue) {
        resolve(value);
      }
    });
  });
  promise.then(unsubscribe);
  return promise;
}