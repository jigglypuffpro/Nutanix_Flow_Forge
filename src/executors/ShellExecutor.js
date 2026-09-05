import { spawn } from 'child_process';

class ShellExecutor {
  constructor(config, context, engine) {
    this.config = config;
    this.context = context;
    this.engine = engine;
  }

  async execute() {
    return new Promise((resolve, reject) => {
      const command = this.config.command;
      if (!command) {
        return reject(new Error('Shell executor requires a "command" property in config'));
      }

      const cwd = this.config.cwd || process.cwd();
      const env = { ...process.env, ...(this.config.env || {}) };
      const timeout = this.config.timeout || 0; // 0 means no timeout

      let childProcess;
      
      // Determine if windows for shell
      const isWin = process.platform === 'win32';
      const shell = isWin ? 'cmd.exe' : '/bin/sh';
      const args = isWin ? ['/c', command] : ['-c', command];

      try {
        childProcess = spawn(shell, args, { cwd, env });
      } catch (e) {
         return reject(e);
      }

      let outputData = '';
      let errorData = '';

      let timeoutId;
      if (timeout > 0) {
          timeoutId = setTimeout(() => {
              childProcess.kill();
              reject(new Error(`Command timed out after ${timeout}ms`));
          }, timeout);
      }

      childProcess.stdout.on('data', (data) => {
        const text = data.toString();
        outputData += text;
      });

      childProcess.stderr.on('data', (data) => {
        errorData += data.toString();
      });

      childProcess.on('close', (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve({
          output: outputData.trim(),
          error: errorData.trim(),
          exitCode: code
        });
      });

      childProcess.on('error', (err) => {
          if (timeoutId) clearTimeout(timeoutId);
          reject(err);
      });
    });
  }
}

export default ShellExecutor;
