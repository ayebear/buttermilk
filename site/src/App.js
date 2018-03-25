import React, { Component } from 'react';
import { hot } from 'react-hot-loader';
import styled from 'styled-components';

import { Link, Router } from '../../src';
import Home from './Home';

class App extends Component {
  render() {
    return (
      <Container>
        <Header>
          <Headline>
            Buttermilk
          </Headline>
        </Header>

        <Content>
          {this.props.children}
        </Content>
      </Container>
    );
  }
}

const desktop = '@media all and (min-width: 768px)';

const Container = styled.div`
  background: #FAFAFA;
  min-height: 100%;
`;

const Header = styled.header`
  align-items: center;
  background: white;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 125px;

  ${desktop} {
    min-height: 300px;
  }
`;

const Headline = styled.h1`
  font-family: 'Vibur', sans-serif;
  font-size: 5rem;
  margin: 0;
  transform: rotate(-6deg);
  transform-origin: center;

  ${desktop} {
    font-size: 10rem;
    text-shadow: 0 0 300px white;
    transition: 500ms text-shadow;

    &:hover {
      text-shadow: 0 0 300px;
    }
  }
`;

const Content = styled.main`
  font-size: 1.6rem;
`;

const routes = [{
  path: '*',
  render: () => Home,
}];

const HotApp = hot(module)(App);

export default () => (
  <Router
    outerComponent={HotApp}
    routes={routes}
  />
);
