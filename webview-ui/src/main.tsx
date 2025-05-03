import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ShikiProvider } from './context/ShikiContext'; // Import ShikiProvider
import { useVSCodeMessaging } from './hooks/useVSCodeMessaging'; // Import the hook

// Create a wrapper component to use the hook
const MainApp = () => {
    const { shikiTheme } = useVSCodeMessaging(); // Get the theme from the hook

    return (
        <ShikiProvider theme={shikiTheme}> {/* Pass the theme to the provider */}
            <App />
        </ShikiProvider>
    );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <MainApp /> {/* Render the wrapper component */}
    </React.StrictMode>
);
