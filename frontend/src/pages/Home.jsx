import React from 'react';
import LeftSidebar from '../components/LeftSidebar';
import MainFeed from '../components/MainFeed';
import RightSidebar from '../components/RightSidebar';

const Home = () => {
  return (
    <>
      <LeftSidebar />
      <MainFeed />
      <RightSidebar />
    </>
  );
};

export default Home;
