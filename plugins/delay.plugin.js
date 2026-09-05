export default {
  name: 'delay',
  description: 'Pauses workflow execution for a specified duration',
  
  validate(config) {
    if (typeof config.ms !== 'number') {
      throw new Error('Delay plugin requires an "ms" property (number)');
    }
  },
  
  async execute(config, api) {
    const ms = config.ms;
    api.log(`Delaying for ${ms}ms...`);
    
    await new Promise(resolve => setTimeout(resolve, ms));
    
    return {
      output: `Delayed for ${ms}ms`,
      exitCode: 0
    };
  }
};
