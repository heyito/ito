import src.output_handler as output_handler # Assuming output_handler.py is in the same directory or accessible

def test_typewrite_output(mocker):
    """Test the typewrite output method."""
    # Mock the pyautogui.typewrite function
    mock_typewrite = mocker.patch('pyautogui.typewrite')
    
    test_text = "Hello, world!"
    
    # Call the function under test
    output_handler.output_text(test_text, method='typewrite')
    
    # Assert that pyautogui.typewrite was called once with the correct text
    mock_typewrite.assert_called_once_with(test_text, interval=0.01)

# TODO: Add tests for the 'clipboard' method
# TODO: Add tests for potential error conditions or edge cases 