import path from 'path';
import config from '../../flowforge.config.js';

class PluginExecutor {
  constructor(stepConfig, context, engine) {
    this.config = stepConfig;
    this.context = context;
    this.engine = engine;
  }

  async execute() {
    const pluginName = this.config.pluginName;
    if (!pluginName) {
      throw new Error('PluginExecutor requires a "pluginName" in config');
    }

    let plugin;
    try {
        const pluginPath = path.resolve(process.cwd(), config.pluginsDir, `${pluginName}.plugin.js`);
        plugin = (await import(`file://${pluginPath}`)).default;
    } catch (e) {
        throw new Error(`Failed to load plugin '${pluginName}': ${e.message}`);
    }

    if (typeof plugin.execute !== 'function') {
        throw new Error(`Plugin '${pluginName}' must export an 'execute' function`);
    }

    if (plugin.validate) {
        plugin.validate(this.config);
    }

    try {
        const pluginApi = {
            getVariable: (key) => this.context.variables[key],
            getStepOutput: (stepName) => this.context.getStepOutput(stepName),
            log: (msg) => {
                console.log(`[Plugin:${pluginName}]`, msg);
            }
        };

        const result = await plugin.execute(this.config, pluginApi);
        
        return {
            output: result?.output || null,
            exitCode: result?.exitCode ?? 0,
            isPluginSuccess: true,
            error: result?.error || null
        };
    } catch (error) {
        return {
            output: null,
            exitCode: 1,
            error: error.message
        };
    }
  }
}

export default PluginExecutor;
