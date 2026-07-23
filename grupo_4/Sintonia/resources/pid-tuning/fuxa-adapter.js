(function (global) {
  'use strict';

  function safeParentApi() {
    try {
      if (global.parent && global.parent !== global && global.parent.fuxaScriptAPI) {
        return global.parent.fuxaScriptAPI;
      }
    } catch (_) {}
    try {
      if (global.fuxaScriptAPI) return global.fuxaScriptAPI;
    } catch (_) {}
    try {
      if (global.opener && !global.opener.closed && global.opener.fuxaScriptAPI) {
        return global.opener.fuxaScriptAPI;
      }
    } catch (_) {}
    return null;
  }

  class FuxaTagAdapter {
    constructor(options) {
      this.options = options || {};
      this.device = this.options.device || '';
      this.apiBase = String(this.options.apiBase || global.location.origin || '').replace(/\/$/, '');
      this.apiKey = this.options.apiKey || '';
      this.token = this.options.token || '';
      this.demo = Boolean(this.options.demo);
      this.clientApi = safeParentApi();
      this.ids = {};
      this.mode = this.demo ? 'demo' : (this.clientApi ? 'client-api' : 'rest-api');
    }

    get description() {
      if (this.mode === 'demo') return 'Modo de demonstração local';
      if (this.mode === 'client-api') return 'API de cliente do FUXA (janela principal)';
      return 'Web API do FUXA';
    }

    async resolveOne(reference) {
      if (reference === undefined || reference === null || reference === '') return null;
      const ref = String(reference).trim();
      if (!ref) return null;
      if (/^t_[A-Za-z0-9_-]+$/.test(ref)) return ref;

      if (this.clientApi && typeof this.clientApi.getTagId === 'function') {
        const resolved = this.clientApi.getTagId(ref, this.device || undefined);
        return resolved || ref;
      }
      return ref;
    }

    async configure(references) {
      const entries = Object.entries(references || {});
      const resolved = await Promise.all(entries.map(async ([key, ref]) => [key, await this.resolveOne(ref)]));
      this.ids = Object.fromEntries(resolved);
      return this.ids;
    }

    headers(json) {
      const h = {};
      if (json) h['Content-Type'] = 'application/json';
      if (this.apiKey) h['x-api-key'] = this.apiKey;
      if (this.token) h['x-access-token'] = this.token;
      return h;
    }

    async read(keys) {
      const wanted = (keys || []).filter(key => this.ids[key]);
      const result = {};
      if (!wanted.length) return result;

      if (this.demo) return result;

      if (this.clientApi && typeof this.clientApi.getTag === 'function') {
        const values = await Promise.all(wanted.map(key => Promise.resolve(this.clientApi.getTag(this.ids[key]))));
        wanted.forEach((key, index) => { result[key] = values[index]; });
        return result;
      }

      const ids = wanted.map(key => this.ids[key]);
      const url = this.apiBase + '/api/getTagValue?ids=' + encodeURIComponent(JSON.stringify(ids));
      const response = await fetch(url, { method: 'GET', headers: this.headers(false), cache: 'no-store' });
      if (!response.ok) throw new Error('GET /api/getTagValue retornou HTTP ' + response.status);
      const values = await response.json();
      const byId = new Map((Array.isArray(values) ? values : []).map(item => [String(item.id), item.value]));
      wanted.forEach(key => { result[key] = byId.get(String(this.ids[key])); });
      return result;
    }

    async write(key, value) {
      const id = this.ids[key];
      if (!id) throw new Error('Tag não configurada para ' + key);
      if (this.demo) return true;

      if (this.clientApi && typeof this.clientApi.setTag === 'function') {
        this.clientApi.setTag(id, value);
        return true;
      }

      const response = await fetch(this.apiBase + '/api/setTagValue', {
        method: 'POST',
        headers: this.headers(true),
        body: JSON.stringify({ tags: [{ id: id, value: value }] })
      });
      if (!response.ok) throw new Error('POST /api/setTagValue retornou HTTP ' + response.status);
      return true;
    }

    async writeMany(values) {
      const entries = Object.entries(values || {}).filter(([key]) => this.ids[key]);
      if (!entries.length) return true;
      if (this.demo) return true;

      if (this.clientApi && typeof this.clientApi.setTag === 'function') {
        entries.forEach(([key, value]) => this.clientApi.setTag(this.ids[key], value));
        return true;
      }

      const tags = entries.map(([key, value]) => ({ id: this.ids[key], value: value }));
      const response = await fetch(this.apiBase + '/api/setTagValue', {
        method: 'POST',
        headers: this.headers(true),
        body: JSON.stringify({ tags: tags })
      });
      if (!response.ok) throw new Error('POST /api/setTagValue retornou HTTP ' + response.status);
      return true;
    }
  }

  global.FuxaTagAdapter = FuxaTagAdapter;
})(window);
