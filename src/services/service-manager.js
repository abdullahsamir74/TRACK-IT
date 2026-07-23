class ServiceManager {
  constructor() {
    this.services = {};
    this.eventHandlers = [];
  }

  /**
   * Register a service instance
   * @param {string} name
   * @param {object} serviceInstance
   */
  register(name, serviceInstance) {
    this.services[name] = serviceInstance;
  }

  /**
   * Get a registered service instance
   * @param {string} name
   */
  get(name) {
    return this.services[name];
  }

  /**
   * Dynamically invoke a service method
   * @param {string} serviceName
   * @param {string} methodName
   * @param  {...any} args
   */
  async invoke(serviceName, methodName, ...args) {
    const service = this.get(serviceName);
    if (!service) {
      throw new Error(`Service "${serviceName}" is not registered`);
    }
    if (typeof service[methodName] !== "function") {
      throw new Error(
        `Method "${methodName}" not found on service "${serviceName}"`,
      );
    }

    // Handle special timer tick callbacks dynamically
    if (
      (serviceName === "timer" &&
        (methodName === "start" || methodName === "resume")) ||
      (serviceName === "tracker" &&
        (methodName === "startTimer" || methodName === "resumeTimer"))
    ) {
      const onTick = (data) => {
        this.notify("timer", "tick", data);
      };
      return await service[methodName](...args, onTick);
    }

    return await service[methodName](...args);
  }

  /**
   * Subscribe to service events
   * @param {function} handler
   */
  onEvent(handler) {
    this.eventHandlers.push(handler);
  }

  /**
   * Notify subscribers of an event
   * @param {string} serviceName
   * @param {string} eventName
   * @param {any} data
   */
  notify(serviceName, eventName, data) {
    for (const handler of this.eventHandlers) {
      try {
        handler(serviceName, eventName, data);
      } catch (err) {
        console.error(
          `Error in event handler for ${serviceName}.${eventName}:`,
          err,
        );
      }
    }
  }
}

module.exports = ServiceManager;
