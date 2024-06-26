import React from "react";
import Container from "./Container";
import { classNames } from "../utils/classNames";

export type ConstraintContainer_Input = {} & React.ComponentProps<
  typeof Container
>;

const ConstraintContainer: React.FC<ConstraintContainer_Input> = ({
  className,
  children,
  ...props
}) => {
  return (
    <>
      <Container
        makeGutter={true}
        className={classNames(className, "p-3 bg-gray-200")}
        {...props}
      >
        <p className="text-center">Constraints</p>
        {children}
      </Container>
    </>
  );
};

export default ConstraintContainer;
