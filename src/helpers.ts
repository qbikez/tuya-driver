import Device, { DeviceEvents } from "./device";
import Frame, { Packet } from "./lib/frame";

export function createPromise<T>() {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  let resolve: (arg0: T) => void = () => {};
  let reject: (arg0: unknown) => void = () => {};

  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

export function subscribeToEvent<T>(
  device: Device,
  event: DeviceEvents
): [Array<{ response?: T; error: any }>, () => Promise<T>] {
  const queue: Array<{ response?: T; error: any }> = [];
  let {
    promise: nextItemPromise,
    resolve: resolveNextItem,
    reject: rejectNextItem,
  } = createPromise<void>();

  device.on(event as any, (data: unknown) => {
    queue.push({ response: data as T, error: undefined });
    resolveNextItem();
  });
  device.on("error", (err) => {
    queue.push({ response: undefined, error: err });
    rejectNextItem(err);
  });
  if (event !== "disconnected") {
    device.on("disconnected", () => {
      queue.push({ response: undefined, error: "disconnected" });
      rejectNextItem("disconnected");
    });
  }

  const factory = () => {
    const { promise, resolve, reject } = createPromise<T>();

    const resolveItem = () => {
      const { promise: np, resolve: nres, reject: nrej } = createPromise<
        void
      >();
      nextItemPromise = np;
      resolveNextItem = nres;
      rejectNextItem = nrej;

      const item = queue.shift()!;
      if (item.error) reject(item.error);
      else resolve(item.response as T);
    };

    if (queue.length > 0) {
      resolveItem();
      return promise;
    } else {
      nextItemPromise.then(resolveItem).catch(err => reject(err));
      return promise;
    }
  };

  return [queue, factory];
}
