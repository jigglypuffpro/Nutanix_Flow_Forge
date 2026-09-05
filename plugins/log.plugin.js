export default {
  name: 'log',
  description: 'Simple logging plugin that writes to stdout',
  
  validate(config) {
    if (!config.message) {
      throw new Error('Log plugin requires a "message" property');
    }
  },
  
  async execute(config, api) {
    const message = config.message;
    console.log(`[FlowForge Log] ${message}`);
    api.log(message);
    
    return {
      output: message,
      exitCode: 0
    };
  }
};
