import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from '../components/Navbar';

const MainLayout = ({ children }) => {
  return (
    <>
      <Navbar />
      <main className="layout-container">
        {children ?? <Outlet />}
      </main>
    </>
  );
};

export default MainLayout;
