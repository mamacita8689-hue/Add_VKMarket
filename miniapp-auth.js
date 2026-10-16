(() => {
  const originalFetch = window.fetch.bind(window);
  const authPaths = ['/api/categories', '/api/albums', '/api/products'];
  let authPromise = null;

  function needsVkAuth(input) {
    const raw = typeof input === 'string' ? input : input?.url || '';
    try {
      const url = new URL(raw, window.location.origin);
      return url.origin === window.location.origin && authPaths.some(path => url.pathname === path);
    } catch {
      return false;
    }
  }

  async function requestVkToken() {
    if (!window.vkBridge?.send) {
      throw new Error('Откройте приложение внутри ВКонтакте');
    }

    await window.vkBridge.send('VKWebAppInit');

    const params = new URLSearchParams(window.location.search);
    const appId = Number(params.get('vk_app_id') || 54827207);
    const result = await window.vkBridge.send('VKWebAppGetAuthToken', {
      app_id: appId,
      scope: 'market',
    });

    const value = result?.access_token;
    if (!value) throw new Error('VK не выдал доступ к товарам');
    return value;
  }

  window.fetch = async (input, init = {}) => {
    if (!needsVkAuth(input)) return originalFetch(input, init);

    authPromise ||= requestVkToken();
    const credential = await authPromise;
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('Authorization', `Bearer ${credential}`);

    let response = await originalFetch(input, { ...init, headers });
    if (response.status === 401) {
      authPromise = null;
      const freshCredential = await (authPromise ||= requestVkToken());
      headers.set('Authorization', `Bearer ${freshCredential}`);
      response = await originalFetch(input, { ...init, headers });
    }
    return response;
  };
})();
