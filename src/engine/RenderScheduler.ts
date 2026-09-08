export class RenderScheduler {
  private static pendingUpdates: Array<() => void> = [];
  private static isScheduled = false;

  static schedule(update: () => void) {
    this.pendingUpdates.push(update);
    if (!this.isScheduled) {
      this.isScheduled = true;
      requestAnimationFrame(this.flush);
    }
  }

  private static flush = () => {
    this.isScheduled = false;
    const start = performance.now();
    
    // Process as many updates as we can within 8ms
    while (this.pendingUpdates.length > 0 && performance.now() - start < 8) {
      const update = this.pendingUpdates.shift();
      if (update) update();
    }

    if (this.pendingUpdates.length > 0) {
      this.isScheduled = true;
      requestAnimationFrame(this.flush);
    }
  }
}
