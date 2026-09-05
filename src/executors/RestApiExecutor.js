class RestApiExecutor {
  constructor(config, context, engine) {
    this.config = config;
    this.context = context;
    this.engine = engine;
  }

  async execute() {
    const {
      method = 'GET',
      url,
      headers = {},
      body,
      queryParams = {},
      auth,
      timeout,
      expectedStatus = [200, 201, 204]
    } = this.config;

    if (!url) {
      throw new Error('RestApiExecutor requires a "url" in config');
    }

    let finalUrl = url;
    if (Object.keys(queryParams).length > 0) {
      const urlObj = new URL(finalUrl);
      for (const [key, value] of Object.entries(queryParams)) {
        urlObj.searchParams.append(key, value);
      }
      finalUrl = urlObj.toString();
    }

    const fetchOptions = {
      method: method.toUpperCase(),
      headers: { ...headers }
    };

    if (auth) {
      if (auth.type === 'bearer' && auth.token) {
        fetchOptions.headers['Authorization'] = `Bearer ${auth.token}`;
      } else if (auth.type === 'basic' && auth.username && auth.password) {
        const base64 = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
        fetchOptions.headers['Authorization'] = `Basic ${base64}`;
      }
    }

    if (body) {
      if (typeof body === 'object') {
        fetchOptions.body = JSON.stringify(body);
        if (!fetchOptions.headers['Content-Type']) {
            fetchOptions.headers['Content-Type'] = 'application/json';
        }
      } else {
        fetchOptions.body = body;
      }
    }

    if (timeout) {
      // AbortController is available in modern Node
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      fetchOptions.signal = controller.signal;
      
      try {
        const response = await fetch(finalUrl, fetchOptions);
        clearTimeout(timeoutId);
        return await this.handleResponse(response, expectedStatus);
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
             throw new Error(`Request timed out after ${timeout}ms`);
        }
        throw error;
      }
    } else {
       const response = await fetch(finalUrl, fetchOptions);
       return await this.handleResponse(response, expectedStatus);
    }
  }

  async handleResponse(response, expectedStatus) {
      const contentType = response.headers.get('content-type') || '';
      let data;
      
      const text = await response.text();
      
      if (contentType.includes('application/json')) {
          try {
              data = text ? JSON.parse(text) : null;
          } catch (e) {
              data = text; // fallback
          }
      } else {
          data = text;
      }

      const isSuccess = expectedStatus.includes(response.status);

      return {
          output: data,
          exitCode: isSuccess ? 0 : response.status,
          error: isSuccess ? null : `HTTP Error ${response.status}: ${JSON.stringify(data)}`
      };
  }
}

export default RestApiExecutor;
