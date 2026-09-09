---
name: react-interface
description: This skill contains instructions for implementing user interface (UI) components with React, use when working on features that require changes to the interface.
---

# React Interface

## Overview

- We use React with Typescript for the UI
- We use less for styling
- We use Redux for state management
- We have quite a few React packages for components
- The game is rendered with PIXI.js, this is just a canvas element in the React app

## Class components

Since it's an old codebase we mostly use class components.

## Refactoring guidance

- Prefer the smallest readable change that solves the problem.
- Preserve existing component shape unless changing it clearly reduces code and complexity.
- Do not convert a class component to a function component if the result adds wrapper components, helper layers, or extra indirection.
- When using hooks such as `useFocusable`, prefer flat component implementations over `Content`/`FocusableX` split patterns unless the split meaningfully improves readability.
- Prioritize simple and local code over abstraction. A little duplication is often better than adding boilerplate for tiny UI components.
- Minimize behavioral churn. Refactors should aim for small diffs and minimal impact on surrounding code.
- If a refactor makes the file longer or harder to scan, prefer the original structure or a more local simplification.

## Styling

For styling we use less, we have a global less file where we put all the global styles and variables. For component specific styles we create a less file in the `style` folder.

## State management

For state management we use Redux, we have a global store where we put all the global state and we have slices for different parts of the state. For example we have a user slice for all the user related state and a game slice for all the game related state.

### Reducer

A reducer holds the initial state object and a list of actions and mutations.
As an example see generalUIReducer.ts.
There is a type definition for the state object, a getInitialState function and a map of handlers.
Whenever you add an action you must also add it to this handlers object so that redux knows what mutator function to run for a given action.

```ts
[ActionType.POPUP_ADD]: generalUIMutators.addPopup,
```

### Action

The actions file holds functions for all the actions.
You basically just create a function with the necessary params.
You then return an object with the action type and the payload.

```ts
export const setIdle = (idle: boolean): ICreatedAction<ActionType.SET_IDLE, boolean> => ({
  type: ActionType.SET_IDLE,
  payload: idle,
});
```

### Mutator

The mutator file holds functions for all the mutations.
Whenever you mutate a state you must make a copy of the existing state.
Then just make the changes you need to make, in this case we change the idle boolean.

```ts
export const setIdle = (state: IGeneralUIState, idle: boolean) =>
  ({
    ...state,
    idle,
  }) as IGeneralUIState;
```

But here is a slightly more complex mutator, we use filter and concat because it returns a copy of the array.

```ts
export const addPopup = (state: IGeneralUIState, newPopup: IPopup<any>) =>
  ({
    ...state,
    popups: state.popups.filter((popup) => popup.id !== newPopup.id).concat(newPopup),
  }) as IGeneralUIState;
```

### Component state

Lastly there we need to use the global state in our components and scenes.
To do so we add the properties we want from the store to the props.
We then add a mapStateToProps function where we return the props object.
Here we can grab values from the store.

```ts
interface IProps {
  idle: boolean;
}

const mapStateToProps = (state: IRootState): IProps => ({
  idle: state.generalUI.idle,
});
```

The last bit is that we need to connect this mapping function to the component so that we connect the store. Without this the component would not update whenever the store changes.
So we change

```ts
export default ReplayOverlay;
```

to

```ts
export default connect(mapStateToProps)(ReplayOverlay);
```

## Popups

We have a custom popup system, basically in the general UI reducer we have an array of popups.
To add a popup we dispatch the `addPopup` action but the pattern we try to follow is that each popup class hass a static `open` function which takes the necessary params to open the popup and then dispatches the action to add the popup to the store.

For each popup we have a class which extends the `PopupBase` class, this class has a `renderContent` function which returns the content of the popup as JSX.

Popups are rendered in the `Popups.tsx` component, new popups need to be added here.

Here is an example popup:

```tsx
interface IExamplePopupProps {
  page: string;
}

export interface IProps extends IBaseProps<ICustomPopupProps> {}

export default class ExamplePopup extends PopupBase<IProps, IState> {
  public static open(page: string): void {
    store.dispatch(addPopup({ id: PopupID.EXAMPLE, type: PopupType.EXAMPLE, content: { page } }));
  }

  public constructor(props: IProps) {
    super({ title: 'Title', mainClass: 'popup--example', analyticsScreen: Screen.POPUP_EXAMPLE }, props);
  }

  protected renderContent(): JSX.Element[] {
    return [<div>Hi</div>];
  }
}
```
