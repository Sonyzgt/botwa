export const stopSignal = {
    isStopped: false,
    stop: () => {
        stopSignal.isStopped = true;
    },
    reset: () => {
        stopSignal.isStopped = false;
    },
    check: () => {
        if (stopSignal.isStopped) {
            throw new Error('Halt signaled');
        }
    }
};
