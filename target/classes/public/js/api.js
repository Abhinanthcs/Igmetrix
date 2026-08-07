/**
 * js/api.js
 * Core API Communication Wrapper with Automatic JWT Injection
 */

const BASE_URL = window.location.origin;

/**
 * Reusable generic fetch wrapper that handles authorization headers automatically.
 * @param {string} endpoint - The API endpoint path (e.g., '/api/student/summary')
 * @param {string} method - HTTP Verb (GET, POST, PUT, DELETE)
 * @param {Object|null} body - Object payload to be sent as JSON string
 * @returns {Promise<Object>} Response data parsed as JSON
 */
export async function fetchData(endpoint, method = 'GET', body = null) {
    const url = `${BASE_URL}${endpoint}`;
    const token = localStorage.getItem('jwt_token');

    const headers = {
        'Content-Type': 'application/json',
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
        method: method,
        headers: headers
    };

    if (body && (method === 'POST' || method === 'PUT')) {
        config.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, config);

        // Handle 401 Unauthorized errors globally
        if (response.status === 401) {
            console.warn("Unauthorized request. Clearing token and redirecting to login.");
            localStorage.removeItem('jwt_token');
            localStorage.removeItem('user_role');
            window.location.href = '/login.html';
            return null;
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP Error ${response.status}: ${errorText || response.statusText}`);
        }

        // Return JSON if there is content, otherwise return success status
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            return await response.json();
        }

        return { success: true };
    } catch (error) {
        console.error(`API Fetch Error [${method} ${endpoint}]:`, error);
        throw error;
    }
}