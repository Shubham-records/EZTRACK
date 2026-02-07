/**
 * Global API helper with automatic 401 logout handling
 * Use this instead of raw fetch() for all authenticated API calls
 */

const getAuthHeaders = () => {
    const token = localStorage.getItem('eztracker_jwt_access_control_token');
    const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Database-Name': dbName,
    };
};

const handleUnauthorized = () => {
    console.warn('Session expired or unauthorized. Logging out...');
    // Clear all auth tokens
    localStorage.removeItem('eztracker_jwt_access_control_token');
    localStorage.removeItem('eztracker_jwt_databaseName_control_token');
    localStorage.removeItem('eztracker_user_data');
    // Redirect to login
    window.location.href = '/login';
};

/**
 * Wrapper around fetch that automatically handles:
 * - Adding auth headers
 * - 401 auto-logout
 * - JSON parsing
 * 
 * @param {string} url - API endpoint (e.g., '/api/members')
 * @param {object} options - fetch options (method, body, etc.)
 * @returns {Promise<{ok: boolean, data: any, status: number}>}
 */
export const apiFetch = async (url, options = {}) => {
    const headers = {
        ...getAuthHeaders(),
        ...options.headers,
    };

    try {
        const response = await fetch(url, {
            ...options,
            headers,
        });

        // Handle 401 Unauthorized - auto logout
        if (response.status === 401) {
            handleUnauthorized();
            return { ok: false, data: null, status: 401, error: 'Unauthorized' };
        }

        // Handle 307 redirect (trailing slash issue)
        if (response.status === 307) {
            const redirectUrl = response.headers.get('location') || url + '/';
            return apiFetch(redirectUrl, options);
        }

        // Try to parse JSON, fallback to text
        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        return {
            ok: response.ok,
            data,
            status: response.status,
        };
    } catch (error) {
        console.error('API Error:', error);
        return {
            ok: false,
            data: null,
            status: 0,
            error: error.message,
        };
    }
};

/**
 * Convenience methods
 */
export const api = {
    get: (url) => apiFetch(url, { method: 'GET' }),

    post: (url, body) => apiFetch(url, {
        method: 'POST',
        body: JSON.stringify(body),
    }),

    put: (url, body) => apiFetch(url, {
        method: 'PUT',
        body: JSON.stringify(body),
    }),

    delete: (url) => apiFetch(url, { method: 'DELETE' }),
};

export default api;
